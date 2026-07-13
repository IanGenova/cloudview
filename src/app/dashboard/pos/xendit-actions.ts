'use server';

import type { Prisma } from '@prisma/client';
import {
  MenuProductType,
  POSXenditStatus,
  ServiceBillingMode,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { assertHotelScope } from '@/lib/access';
import { requireRole, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  createXenditCheckoutSession,
  type XenditLineItem,
} from '@/lib/xendit';
import { cleanText } from '@/lib/sanitize';
import { notifyPosXenditStatus } from '@/lib/xendit-dashboard-notifications';
import { createPOSXenditReturnState } from '@/lib/pos-xendit-return';
import {
  buildXenditSplitConfiguration,
  type XenditSplitSnapshot,
} from '@/lib/xendit-split';
import { createPOSOrder } from './actions';

type CheckoutInput = {
  hotelId: string;
  roomId?: string | null;
  guestName?: string;
  notes?: string;
  items?: Array<{
    productId: string;
    quantity: number;
  }>;
  services?: Array<{
    serviceId: string;
    quantity: number;
  }>;
};

type StoredPOSPayload = {
  hotelId: string;
  roomId: string | null;
  guestName: string;
  notes: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  services: Array<{
    serviceId: string;
    quantity: number;
  }>;
  xenditSplit: XenditSplitSnapshot | null;
};

export type CreateXenditPOSCheckoutResult =
  | {
      ok: true;
      sessionId: string;
      checkoutUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

export type XenditPOSStatusResult =
  | {
      ok: true;
      id: string;
      status: POSXenditStatus;
      orderCode: string | null;
      serviceRequestCodes: string[];
      errorMessage: string | null;
    }
  | {
      ok: false;
      error: string;
    };

export type FinalizeXenditPOSCheckoutResult =
  | {
      ok: true;
      alreadyFinalized: boolean;
      orderCode: string | null;
      serviceRequestCodes: string[];
    }
  | {
      ok: false;
      waiting: true;
      message: string;
    }
  | {
      ok: false;
      waiting: false;
      error: string;
    };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
}

function getPublicXenditError(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback);

  if (process.env.NODE_ENV !== 'production') {
    return message;
  }

  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes('xendit') ||
    lowerMessage.includes('secret key') ||
    lowerMessage.includes('app_url') ||
    lowerMessage.includes('checkout session') ||
    lowerMessage.includes('request failed')
  ) {
    return 'Unable to start the secure Xendit checkout. Please verify the payment configuration or use another payment method.';
  }

  return message;
}

function logXenditActionError(
  operation: string,
  error: unknown,
  context: Record<string, string | null | undefined> = {}
) {
  console.error(`[POS Xendit] ${operation} failed.`, {
    ...context,
    message: getErrorMessage(error, 'Unknown Xendit error.'),
    ...(process.env.NODE_ENV !== 'production' && error instanceof Error
      ? { stack: error.stack }
      : {}),
  });
}


function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function normalizeQuantities<T extends 'productId' | 'serviceId'>(
  values: Array<Record<T, string> & { quantity: number }> | undefined,
  key: T
) {
  const quantities = new Map<string, number>();

  for (const value of values ?? []) {
    const id = cleanText(value[key]);
    const quantity = positiveInteger(value.quantity);

    if (!id || quantity === null) {
      throw new Error('The cart contains an invalid item quantity.');
    }

    quantities.set(id, (quantities.get(id) ?? 0) + quantity);
  }

  return Array.from(quantities.entries()).map(([id, quantity]) => ({
    [key]: id,
    quantity,
  })) as Array<Record<T, string> & { quantity: number }>;
}

function isPrivateReturnHostname(hostname: string) {
  const host = hostname.trim().toLowerCase();

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.localhost')
  ) {
    return true;
  }

  if (/^10\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)) {
    return true;
  }

  if (/^192\.168\.(?:\d{1,3}\.)\d{1,3}$/.test(host)) {
    return true;
  }

  const private172 = host.match(
    /^172\.(\d{1,3})\.(?:\d{1,3})\.(?:\d{1,3})$/
  );

  if (private172) {
    const secondOctet = Number(private172[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
}

function normalizePOSReturnBaseUrl(value: string, source: string) {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${source} must be an absolute HTTP or HTTPS URL.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${source} must use HTTP or HTTPS.`);
  }

  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol !== 'https:' &&
    !isPrivateReturnHostname(url.hostname)
  ) {
    throw new Error(
      `${source} must use HTTPS unless it points to localhost or a private LAN address.`
    );
  }

  /**
   * Return only the origin. The POS route is appended explicitly below, so a
   * value containing an old path cannot accidentally send the cashier to the
   * landing page.
   */
  return url.origin;
}

async function getPOSXenditReturnBaseUrl() {
  const requestHeaders = await headers();

  /**
   * The live browser request must win over every environment fallback.
   * Dashboard auth cookies are host-specific. Returning to a different host
   * can make an authenticated cashier appear logged out.
   */
  const requestOrigin = requestHeaders.get('origin')?.trim();

  if (requestOrigin) {
    return normalizePOSReturnBaseUrl(requestOrigin, 'POS request origin');
  }

  const forwardedHost = requestHeaders
    .get('x-forwarded-host')
    ?.split(',')[0]
    ?.trim();
  const host = forwardedHost || requestHeaders.get('host')?.trim();

  if (host) {
    const forwardedProtocol = requestHeaders
      .get('x-forwarded-proto')
      ?.split(',')[0]
      ?.trim();
    const hostWithoutPort = host.replace(/^\[/, '').split(']')[0].split(':')[0];
    const protocol =
      forwardedProtocol ||
      (isPrivateReturnHostname(hostWithoutPort) ? 'http' : 'https');

    return normalizePOSReturnBaseUrl(
      `${protocol}://${host}`,
      'POS request host'
    );
  }

  /**
   * Environment values are fallbacks only. They must never override the host
   * on which the cashier actually opened the dashboard.
   */
  const fallback =
    process.env.POS_XENDIT_RETURN_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    '';

  if (!fallback) {
    throw new Error(
      'Unable to determine the POS Xendit return URL. Configure NEXT_PUBLIC_APP_URL or APP_URL.'
    );
  }

  return normalizePOSReturnBaseUrl(fallback, 'POS Xendit fallback URL');
}

function createPOSXenditReturnUrls(input: {
  baseUrl: string;
  hotelId: string;
  sessionId: string;
}) {
  const createReturnUrl = (result: 'success' | 'cancelled') => {
    const returnUrl = new URL('/xendit/pos-return', `${input.baseUrl}/`);
    returnUrl.searchParams.set(
      'state',
      createPOSXenditReturnState({
        sessionId: input.sessionId,
        hotelId: input.hotelId,
        result,
      })
    );

    return returnUrl.toString();
  };

  return {
    successUrl: createReturnUrl('success'),
    cancelUrl: createReturnUrl('cancelled'),
  };
}

function parseStoredPayload(value: Prisma.JsonValue): StoredPOSPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored Xendit cart data is invalid.');
  }

  const payload = value as unknown as StoredPOSPayload;

  if (
    typeof payload.hotelId !== 'string' ||
    !Array.isArray(payload.items) ||
    !Array.isArray(payload.services)
  ) {
    throw new Error('Stored Xendit cart data is incomplete.');
  }

  return payload;
}

async function createXenditPOSCheckoutInternal(input: CheckoutInput) {
  const user = await requireUser();
  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const hotelId = cleanText(input.hotelId);
  const roomId = cleanText(input.roomId) || null;
  const guestName = cleanText(input.guestName, 100) ?? '';
  const notes = cleanText(input.notes, 1000) ?? '';

  if (!hotelId) {
    throw new Error('Hotel is required.');
  }

  assertHotelScope(user, hotelId);

  const items = normalizeQuantities(input.items, 'productId');
  const services = normalizeQuantities(input.services, 'serviceId');

  if (!items.length && !services.length) {
    throw new Error('Please add at least one food item or service item.');
  }

  const productIds = items.map((item) => item.productId);
  const serviceIds = services.map((item) => item.serviceId);

  const [hotel, products, serviceRecords] = await Promise.all([
    db.hotel.findUnique({
      where: { id: hotelId },
      include: { settings: true },
    }),
    productIds.length
      ? db.menuProduct.findMany({
          where: {
            id: { in: productIds },
            hotelId,
            isAvailable: true,
          },
          include: {
            images: { take: 1 },
            bundleComponents: {
              include: {
                componentProduct: {
                  select: {
                    id: true,
                    name: true,
                    isAvailable: true,
                    productType: true,
                  },
                },
              },
            },
          },
        })
      : [],
    serviceIds.length
      ? db.serviceCatalogItem.findMany({
          where: {
            id: { in: serviceIds },
            hotelId,
            isActive: true,
          },
          include: {
            availabilityStock: true,
          },
        })
      : [],
  ]);

  if (!hotel) {
    throw new Error('Hotel was not found.');
  }

  const hotelCurrency = hotel.settings?.currency || 'PHP';

  if (hotelCurrency !== 'PHP') {
    throw new Error('Xendit checkout currently requires PHP currency.');
  }

  if (products.length !== productIds.length) {
    throw new Error('One or more food products are no longer available.');
  }

  if (serviceRecords.length !== serviceIds.length) {
    throw new Error('One or more service items are no longer available.');
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  const serviceMap = new Map(
    serviceRecords.map((service) => [service.id, service])
  );

  // Validate the same underlying stock that a bundle consumes.
  const foodRequirements = new Map<
    string,
    { name: string; quantity: number }
  >();

  for (const item of items) {
    const product = productMap.get(item.productId)!;

    if (product.productType === MenuProductType.BUNDLE) {
      if (!product.bundleComponents.length) {
        throw new Error(`${product.name} has no bundle components.`);
      }

      for (const component of product.bundleComponents) {
        if (
          !component.componentProduct.isAvailable ||
          component.componentProduct.productType !== MenuProductType.SINGLE ||
          !Number.isInteger(component.quantity) ||
          component.quantity <= 0
        ) {
          throw new Error(`${product.name} has an unavailable bundle component.`);
        }

        const required = component.quantity * item.quantity;
        const current = foodRequirements.get(component.componentProductId);
        foodRequirements.set(component.componentProductId, {
          name: component.componentProduct.name,
          quantity: (current?.quantity ?? 0) + required,
        });
      }
    } else {
      const current = foodRequirements.get(product.id);
      foodRequirements.set(product.id, {
        name: product.name,
        quantity: (current?.quantity ?? 0) + item.quantity,
      });
    }
  }

  const foodStocks = foodRequirements.size
    ? await db.menuAvailabilityStock.findMany({
        where: {
          hotelId,
          productId: { in: Array.from(foodRequirements.keys()) },
        },
      })
    : [];

  const foodStockMap = new Map(
    foodStocks.map((stock) => [stock.productId, stock])
  );

  for (const [productId, requirement] of foodRequirements) {
    const stock = foodStockMap.get(productId);

    if (!stock || stock.isSoldOut || stock.availableQty < requirement.quantity) {
      throw new Error(`${requirement.name} no longer has enough stock.`);
    }
  }

  for (const item of services) {
    const service = serviceMap.get(item.serviceId)!;
    const stock = service.availabilityStock;

    if (
      service.inventoryTracked &&
      (!stock || stock.isSoldOut || stock.availableQty < item.quantity)
    ) {
      throw new Error(`${service.name} no longer has enough stock.`);
    }
  }

  const lineItems: XenditLineItem[] = [];
  let amountCents = 0;

  for (const item of items) {
    const product = productMap.get(item.productId)!;

    if (product.priceCents <= 0) {
      continue;
    }

    amountCents += product.priceCents * item.quantity;
    lineItems.push({
      name: product.name.slice(0, 120),
      description: (product.description || 'Cloud View Hotel POS item').slice(
        0,
        255
      ),
      amount: product.priceCents,
      currency: 'PHP',
      quantity: item.quantity,
      images: product.images[0]?.url ? [product.images[0].url] : undefined,
    });
  }

  for (const item of services) {
    const service = serviceMap.get(item.serviceId)!;

    if (service.billingMode !== ServiceBillingMode.FIXED_PRICE) {
      continue;
    }

    const unitPriceCents = Math.round(Number(service.unitPrice || 0) * 100);

    if (unitPriceCents <= 0) {
      continue;
    }

    amountCents += unitPriceCents * item.quantity;
    lineItems.push({
      name: service.name.slice(0, 120),
      description: (service.description || 'Cloud View Hotel service').slice(
        0,
        255
      ),
      amount: unitPriceCents,
      currency: 'PHP',
      quantity: item.quantity,
    });
  }

  if (amountCents <= 0 || !lineItems.length) {
    throw new Error(
      'This cart has no payable amount. Use Pay Later, Room Charge, or Cash instead.'
    );
  }

  const splitConfiguration = await buildXenditSplitConfiguration({
    hotelId,
    amountCents,
    settings: hotel.settings,
  });

  const payload: StoredPOSPayload = {
    hotelId,
    roomId,
    guestName,
    notes,
    items,
    services,
    xenditSplit: splitConfiguration?.snapshot ?? null,
  };

  const draft = await db.posXenditSession.create({
    data: {
      paymentProvider: 'XENDIT',
      hotelId,
      createdById: user.id,
      amountCents,
      currency: 'PHP',
      payload: payload as unknown as Prisma.InputJsonValue,
      status: POSXenditStatus.PENDING,
    },
    select: {
      id: true,
    },
  });

  try {
    const returnBaseUrl = await getPOSXenditReturnBaseUrl();
    const { successUrl, cancelUrl } = createPOSXenditReturnUrls({
      baseUrl: returnBaseUrl,
      hotelId,
      sessionId: draft.id,
    });

    if (process.env.NODE_ENV !== 'production') {
      console.info('[POS Xendit] Checkout return URLs prepared.', {
        sessionId: draft.id,
        successUrl,
        cancelUrl,
      });
    }

    const checkout = await createXenditCheckoutSession({
      idempotencyKey: `cloudview-pos-${draft.id}`,
      lineItems,
      successUrl,
      cancelUrl,
      description: `${hotel.name} POS sale`,
      referenceNumber: draft.id,
      metadata: {
        pos_session_id: draft.id,
        hotel_id: hotelId,
        created_by: user.id,
        return_origin: returnBaseUrl,
        split_enabled: splitConfiguration ? 'true' : 'false',
        split_fee_bearer:
          splitConfiguration?.snapshot.feeBearer ?? '',
      },
      splitPayment: splitConfiguration?.splitPayment,
    });

    await db.posXenditSession.update({
      where: { id: draft.id },
      data: {
        checkoutSessionId: checkout.id,
        checkoutUrl: checkout.checkoutUrl,
        xenditPaymentRequestId: checkout.paymentRequestId,
        errorMessage: null,
      },
    });

    return {
      ok: true as const,
      sessionId: draft.id,
      checkoutUrl: checkout.checkoutUrl,
    };
  } catch (error) {
    const message = getErrorMessage(
      error,
      'Unable to create Xendit checkout.'
    );

    try {
      await db.posXenditSession.update({
        where: { id: draft.id },
        data: {
          status: POSXenditStatus.FAILED,
          errorMessage: message.slice(0, 2000),
        },
      });

      await notifyPosXenditStatus({ sessionId: draft.id }).catch(
        (notificationError) =>
          console.warn(
            '[POS Xendit] Unable to create failed-payment notification.',
            notificationError
          )
      );
    } catch (updateError) {
      logXenditActionError('mark checkout as failed', updateError, {
        hotelId,
        sessionId: draft.id,
      });
    }

    throw error instanceof Error ? error : new Error(message);
  }
}

export async function createXenditPOSCheckout(
  input: CheckoutInput
): Promise<CreateXenditPOSCheckoutResult> {
  try {
    return await createXenditPOSCheckoutInternal(input);
  } catch (error) {
    logXenditActionError('create checkout', error, {
      hotelId:
        typeof input?.hotelId === 'string'
          ? input.hotelId
          : null,
    });

    return {
      ok: false,
      error: getPublicXenditError(
        error,
        'Unable to create Xendit checkout.'
      ),
    };
  }
}

async function getXenditPOSStatusInternal(sessionIdInput: string) {
  const user = await requireUser();
  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const sessionId = cleanText(sessionIdInput);

  if (!sessionId) {
    throw new Error('Xendit session is required.');
  }

  const session = await db.posXenditSession.findFirst({
    where: { id: sessionId, paymentProvider: 'XENDIT' },
    select: {
      id: true,
      hotelId: true,
      status: true,
      orderCode: true,
      serviceRequestCodes: true,
      errorMessage: true,
    },
  });

  if (!session) {
    throw new Error('Xendit POS session was not found.');
  }

  assertHotelScope(user, session.hotelId);

  return {
    ok: true as const,
    id: session.id,
    status: session.status,
    orderCode: session.orderCode,
    serviceRequestCodes: Array.isArray(session.serviceRequestCodes)
      ? session.serviceRequestCodes.filter(
          (value): value is string => typeof value === 'string'
        )
      : [],
    errorMessage: session.errorMessage,
  };
}

export async function getXenditPOSStatus(
  sessionIdInput: string
): Promise<XenditPOSStatusResult> {
  try {
    return await getXenditPOSStatusInternal(sessionIdInput);
  } catch (error) {
    logXenditActionError('read checkout status', error, {
      sessionId:
        typeof sessionIdInput === 'string'
          ? sessionIdInput
          : null,
    });

    return {
      ok: false,
      error: getPublicXenditError(
        error,
        'Unable to read the Xendit payment status.'
      ),
    };
  }
}

async function finalizeXenditPOSCheckoutInternal(sessionIdInput: string) {
  const user = await requireUser();
  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const sessionId = cleanText(sessionIdInput);

  if (!sessionId) {
    throw new Error('Xendit session is required.');
  }

  const session = await db.posXenditSession.findFirst({
    where: { id: sessionId, paymentProvider: 'XENDIT' },
  });

  if (!session) {
    throw new Error('Xendit POS session was not found.');
  }

  assertHotelScope(user, session.hotelId);

  if (session.status === POSXenditStatus.COMPLETED) {
    return {
      ok: true as const,
      alreadyFinalized: true,
      orderCode: session.orderCode,
      serviceRequestCodes: Array.isArray(session.serviceRequestCodes)
        ? session.serviceRequestCodes.filter(
            (value): value is string => typeof value === 'string'
          )
        : [],
    };
  }

  if (session.status !== POSXenditStatus.PAID) {
    if (session.status === POSXenditStatus.PROCESSING) {
      return {
        ok: false as const,
        waiting: true as const,
        message: 'The paid sale is already being finalized.',
      };
    }

    throw new Error(
      session.errorMessage || 'Waiting for Xendit payment confirmation.'
    );
  }

  const claimed = await db.posXenditSession.updateMany({
    where: {
      id: session.id,
      paymentProvider: 'XENDIT',
      status: POSXenditStatus.PAID,
    },
    data: {
      status: POSXenditStatus.PROCESSING,
      processingStartedAt: new Date(),
      errorMessage: null,
    },
  });

  if (claimed.count !== 1) {
    return {
      ok: false as const,
      waiting: true as const,
      message: 'The payment is already being finalized.',
    };
  }

  const payload = parseStoredPayload(session.payload);
  const xenditReference = session.checkoutSessionId || session.id;

  try {
    // Existing createPOSOrder remains the single source of truth for stock,
    // kitchen routing, service requests, audit logs, and room add-on charges.
    const result = await createPOSOrder({
      ...payload,
      paymentMethod: 'POS',
      notes: [
        payload.notes || null,
        `Xendit checkout: ${xenditReference}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    await db.posXenditSession.update({
      where: { id: session.id },
      data: {
        status: POSXenditStatus.COMPLETED,
        orderCode: result.orderCode,
        serviceRequestCodes:
          result.serviceRequestCodes as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    await notifyPosXenditStatus({ sessionId: session.id }).catch(
      (notificationError) =>
        console.warn(
          '[POS Xendit] Unable to create completion notification.',
          notificationError
        )
    );

    revalidatePath('/dashboard/pos');

    return {
      ok: true as const,
      alreadyFinalized: false,
      orderCode: result.orderCode,
      serviceRequestCodes: result.serviceRequestCodes,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'The payment succeeded, but the POS sale needs manual review.';

    await db.posXenditSession.update({
      where: { id: session.id },
      data: {
        status: POSXenditStatus.PAID_REVIEW_REQUIRED,
        errorMessage: message,
      },
    });

    await notifyPosXenditStatus({ sessionId: session.id }).catch(
      (notificationError) =>
        console.warn(
          '[POS Xendit] Unable to create review notification.',
          notificationError
        )
    );

    throw new Error(
      `Payment received, but the sale could not be finalized: ${message}`
    );
  }
}

export async function finalizeXenditPOSCheckout(
  sessionIdInput: string
): Promise<FinalizeXenditPOSCheckoutResult> {
  try {
    return await finalizeXenditPOSCheckoutInternal(sessionIdInput);
  } catch (error) {
    logXenditActionError('finalize paid checkout', error, {
      sessionId:
        typeof sessionIdInput === 'string'
          ? sessionIdInput
          : null,
    });

    return {
      ok: false,
      waiting: false,
      error: getPublicXenditError(
        error,
        'The payment could not be finalized.'
      ),
    };
  }
}

