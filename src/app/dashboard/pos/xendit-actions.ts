'use server';

import type { Prisma } from '@prisma/client';
import {
  MenuProductType,
  POSXenditStatus,
  ServiceBillingMode,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { assertHotelScope } from '@/lib/access';
import { requireRole, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  cancelXenditCheckoutSessionIfActive,
  createXenditCheckoutSession,
  type XenditLineItem,
} from '@/lib/xendit';
import { cleanText } from '@/lib/sanitize';
import { notifyPosXenditStatus } from '@/lib/xendit-dashboard-notifications';
import { createPOSXenditReturnState } from '@/lib/pos-xendit-return';
import {
  createXenditIntentFingerprint,
  decideExistingXenditSession,
  readXenditIntentFingerprint,
} from '@/lib/xendit-session-policy';
import {
  buildXenditSplitConfiguration,
  getXenditForUserIdFromPayload,
  type XenditSplitSnapshot,
} from '@/lib/xendit-split';
import { createPOSOrder, createPOSOrderAsUser } from './actions';
import { assertXenditWebhookRecoveryToken } from '@/lib/xendit-webhook-recovery-token';

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
  existingSessionId?: string | null;
};

type StoredPOSPayload = {
  flow?: 'POS';
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
  paymentIntentFingerprint?: string;
  xenditExpiresAt?: string;
};

export type CreateXenditPOSCheckoutResult =
  | {
      ok: true;
      sessionId: string;
      checkoutUrl: string;
      reusedSession?: boolean;
    }
  | {
      ok: false;
      error: string;
      existingSession?: boolean;
      sessionId?: string;
      checkoutUrl?: string | null;
      status?: POSXenditStatus;
      paymentCompleted?: boolean;
    };

export type XenditPOSStatusResult =
  | {
      ok: true;
      id: string;
      status: POSXenditStatus;
      orderCode: string | null;
      serviceRequestCodes: string[];
      errorMessage: string | null;
      checkoutUrl: string | null;
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

function normalizePOSReturnBaseUrl(value: string, source: string) {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${source} must be an absolute HTTPS URL.`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(
      `${source} must use HTTPS. Use the public ngrok URL during local Xendit testing.`
    );
  }

  return url.origin;
}

async function getPOSXenditReturnBaseUrl() {
  /**
   * Xendit must always receive a public HTTPS return URL. The cashier may be
   * using the POS through a private LAN URL, but Xendit cannot redirect to an
   * HTTP/private address directly. The public return page bridges the browser
   * back to NEXT_PUBLIC_APP_URL after validating the signed state.
   */
  const publicReturnUrl =
    process.env.POS_XENDIT_RETURN_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    '';

  if (!publicReturnUrl) {
    throw new Error(
      'POS_XENDIT_RETURN_URL or APP_URL is required for the Xendit POS return URL.'
    );
  }

  return normalizePOSReturnBaseUrl(
    publicReturnUrl,
    'POS Xendit public return URL'
  );
}

function createPOSXenditReturnUrls(input: {
  baseUrl: string;
  hotelId: string;
  sessionId: string;
}) {
  const createReturnUrl = (result: 'success' | 'cancelled') => {
    const returnUrl = new URL('/api/xendit/admin-return', `${input.baseUrl}/`);
    returnUrl.searchParams.set('target', 'pos');
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

function createPOSIntentFingerprint(input: {
  payload: StoredPOSPayload;
  amountCents: number;
}) {
  return createXenditIntentFingerprint({
    flow: 'POS',
    hotelId: input.payload.hotelId,
    roomId: input.payload.roomId,
    guestName: input.payload.guestName,
    notes: input.payload.notes,
    items: [...input.payload.items].sort((left, right) =>
      left.productId.localeCompare(right.productId)
    ),
    services: [...input.payload.services].sort((left, right) =>
      left.serviceId.localeCompare(right.serviceId)
    ),
    amountCents: input.amountCents,
    split: input.payload.xenditSplit,
  });
}

function getStoredPOSFingerprint(payload: Prisma.JsonValue, amountCents: number) {
  const stored = readXenditIntentFingerprint(payload);
  if (stored) return stored;

  try {
    const parsed = parseStoredPayload(payload);
    return createPOSIntentFingerprint({ payload: parsed, amountCents });
  } catch {
    return null;
  }
}

async function cancelSupersededPOSSession(
  session: {
    id: string;
    checkoutSessionId: string | null;
    payload: Prisma.JsonValue;
    createdAt: Date;
  },
  reason: string
) {
  if (!session.checkoutSessionId) {
    if (Date.now() - session.createdAt.getTime() < 2 * 60 * 1000) {
      throw new Error(
        'The previous Xendit checkout is still being prepared. Please try again shortly.'
      );
    }
  } else {
    const remote = await cancelXenditCheckoutSessionIfActive(
      session.checkoutSessionId,
      getXenditForUserIdFromPayload(session.payload)
    );

    if (remote.status === 'COMPLETED') {
      throw new Error(
        'The previous Xendit checkout was already paid. Wait for confirmation before changing the POS cart.'
      );
    }
  }

  await db.posXenditSession.updateMany({
    where: { id: session.id, status: POSXenditStatus.PENDING },
    data: {
      status: POSXenditStatus.CANCELLED,
      errorMessage: reason.slice(0, 2000),
    },
  });
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

  const basePayload: StoredPOSPayload = {
    flow: 'POS',
    hotelId,
    roomId,
    guestName,
    notes,
    items,
    services,
    xenditSplit: splitConfiguration?.snapshot ?? null,
  };
  const paymentIntentFingerprint = createPOSIntentFingerprint({
    payload: basePayload,
    amountCents,
  });
  const returnBaseUrl = await getPOSXenditReturnBaseUrl();
  const requestedSessionId = cleanText(input.existingSessionId);

  const pendingSessions = await db.posXenditSession.findMany({
    where: {
      paymentProvider: 'XENDIT',
      hotelId,
      createdById: user.id,
      status: POSXenditStatus.PENDING,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      amountCents: true,
      checkoutSessionId: true,
      checkoutUrl: true,
      payload: true,
      createdAt: true,
    },
  });

  for (const session of pendingSessions) {
    let parsed: StoredPOSPayload;

    try {
      parsed = parseStoredPayload(session.payload);
    } catch {
      // PosXenditSession is also used by guest-stay checkout. Ignore those
      // records here and only enforce the guard against another POS sale.
      continue;
    }

    if (parsed.flow && parsed.flow !== 'POS') {
      continue;
    }

    const sameIntent =
      getStoredPOSFingerprint(session.payload, session.amountCents) ===
      paymentIntentFingerprint;
    const decision = await decideExistingXenditSession({
      checkoutSessionId: session.checkoutSessionId,
      checkoutUrl: session.checkoutUrl,
      expiresAt: parsed.xenditExpiresAt,
      createdAt: session.createdAt,
      forUserId: getXenditForUserIdFromPayload(session.payload),
    });
    const returnUrls = createPOSXenditReturnUrls({
      baseUrl: returnBaseUrl,
      hotelId,
      sessionId: session.id,
    });

    if (decision.action === 'COMPLETED') {
      const amountMatches =
        decision.amountCents === null ||
        decision.amountCents === session.amountCents;
      const currencyMatches =
        !decision.currency || decision.currency === 'PHP';

      await db.posXenditSession.update({
        where: { id: session.id },
        data: {
          status:
            amountMatches && currencyMatches
              ? POSXenditStatus.PAID
              : POSXenditStatus.PAID_REVIEW_REQUIRED,
          xenditPaymentId: decision.paymentId,
          xenditPaymentRequestId: decision.paymentRequestId,
          paidAmountCents: decision.amountCents ?? session.amountCents,
          paidAt: new Date(),
          errorMessage:
            amountMatches && currencyMatches
              ? null
              : 'The completed Xendit session amount or currency did not match the stored POS sale.',
        },
      });

      return {
        ok: false as const,
        existingSession: true as const,
        paymentCompleted: true as const,
        sessionId: session.id,
        checkoutUrl: returnUrls.successUrl,
        status:
          amountMatches && currencyMatches
            ? POSXenditStatus.PAID
            : POSXenditStatus.PAID_REVIEW_REQUIRED,
        error:
          'An earlier Xendit payment was already received. CloudView is finalizing that sale; a second payment is blocked.',
      };
    }

    if (decision.action === 'CONTINUE') {
      await db.posXenditSession.update({
        where: { id: session.id },
        data: {
          checkoutSessionId: decision.checkoutSessionId,
          checkoutUrl: decision.checkoutUrl,
          xenditPaymentRequestId: decision.paymentRequestId ?? undefined,
          payload: {
            ...(session.payload as Prisma.JsonObject),
            flow: 'POS',
            paymentIntentFingerprint:
              sameIntent
                ? paymentIntentFingerprint
                : readXenditIntentFingerprint(session.payload) || '',
            xenditExpiresAt: decision.expiresAt?.toISOString() || '',
          } as Prisma.InputJsonValue,
          errorMessage: null,
        },
      });

      if (sameIntent) {
        return {
          ok: true as const,
          sessionId: session.id,
          checkoutUrl: decision.checkoutUrl,
          reusedSession: true as const,
        };
      }

      return {
        ok: false as const,
        existingSession: true as const,
        sessionId: session.id,
        checkoutUrl: decision.checkoutUrl,
        status: POSXenditStatus.PENDING,
        error:
          'Another Xendit checkout is still active for this cashier. Continue or cancel it before starting a different sale.',
      };
    }

    if (decision.action === 'WAIT') {
      return {
        ok: false as const,
        existingSession: true as const,
        sessionId: session.id,
        checkoutUrl: session.checkoutUrl,
        status: POSXenditStatus.PENDING,
        error: decision.reason,
      };
    }

    // Only terminal, expired, or unusable remote sessions are replaced
    // automatically. An active payable link is never silently superseded.
    await cancelSupersededPOSSession(session, decision.reason);
  }

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const payload: StoredPOSPayload = {
    ...basePayload,
    paymentIntentFingerprint,
    xenditExpiresAt: expiresAt.toISOString(),
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
        payment_intent: paymentIntentFingerprint.slice(0, 40),
      },
      splitPayment: splitConfiguration?.splitPayment,
      expiresAt,
    });

    await db.posXenditSession.update({
      where: { id: draft.id },
      data: {
        checkoutSessionId: checkout.id,
        checkoutUrl: checkout.checkoutUrl,
        xenditPaymentRequestId: checkout.paymentRequestId,
        payload: {
          ...payload,
          xenditExpiresAt: checkout.expiresAt,
        } as Prisma.InputJsonValue,
        errorMessage: null,
      },
    });

    return {
      ok: true as const,
      sessionId: draft.id,
      checkoutUrl: checkout.checkoutUrl,
      reusedSession: false as const,
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

export async function cancelXenditPOSCheckout(sessionIdInput: string) {
  try {
    const user = await requireUser();
    requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

    const sessionId = cleanText(sessionIdInput);
    if (!sessionId) {
      return { ok: false as const, error: 'Xendit session is required.' };
    }

    const session = await db.posXenditSession.findFirst({
      where: { id: sessionId, paymentProvider: 'XENDIT' },
      select: {
        id: true,
        hotelId: true,
        status: true,
        checkoutSessionId: true,
        payload: true,
        amountCents: true,
        currency: true,
      },
    });

    if (!session) {
      return { ok: false as const, error: 'Xendit POS session was not found.' };
    }

    assertHotelScope(user, session.hotelId);

    if (session.status === POSXenditStatus.CANCELLED) {
      return { ok: true as const, alreadyCancelled: true as const };
    }

    if (session.status !== POSXenditStatus.PENDING) {
      const paymentCompleted =
        session.status === POSXenditStatus.PAID ||
        session.status === POSXenditStatus.PROCESSING ||
        session.status === POSXenditStatus.COMPLETED ||
        session.status === POSXenditStatus.PAID_REVIEW_REQUIRED;

      return {
        ok: false as const,
        ...(paymentCompleted ? { paymentCompleted: true as const } : {}),
        error: paymentCompleted
          ? 'Payment was already received and can no longer be cancelled.'
          : 'This checkout can no longer be cancelled.',
      };
    }

    if (session.checkoutSessionId) {
      const remote = await cancelXenditCheckoutSessionIfActive(
        session.checkoutSessionId,
        getXenditForUserIdFromPayload(session.payload)
      );

      if (remote.status === 'COMPLETED') {
        const amountMatches =
          remote.amountCents === null || remote.amountCents === session.amountCents;
        const currencyMatches =
          !remote.currency || remote.currency === session.currency.toUpperCase();

        await db.posXenditSession.updateMany({
          where: { id: session.id, status: POSXenditStatus.PENDING },
          data: {
            status:
              amountMatches && currencyMatches
                ? POSXenditStatus.PAID
                : POSXenditStatus.PAID_REVIEW_REQUIRED,
            xenditPaymentId: remote.paymentId,
            xenditPaymentRequestId: remote.paymentRequestId,
            paidAmountCents: remote.amountCents ?? session.amountCents,
            paidAt: new Date(),
            errorMessage:
              amountMatches && currencyMatches
                ? null
                : 'The completed Xendit session amount or currency did not match the stored POS sale.',
          },
        });

        await notifyPosXenditStatus({ sessionId: session.id }).catch(
          () => undefined
        );

        return {
          ok: false as const,
          paymentCompleted: true as const,
          error: 'Payment was already completed and can no longer be cancelled.',
        };
      }
    }

    await db.posXenditSession.updateMany({
      where: { id: session.id, status: POSXenditStatus.PENDING },
      data: {
        status: POSXenditStatus.CANCELLED,
        errorMessage: 'The cashier cancelled the Xendit checkout.',
      },
    });

    await notifyPosXenditStatus({ sessionId: session.id }).catch(() => undefined);

    return { ok: true as const, alreadyCancelled: false as const };
  } catch (error) {
    return {
      ok: false as const,
      error: getPublicXenditError(error, 'Unable to cancel the Xendit checkout.'),
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
      checkoutUrl: true,
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
    checkoutUrl: session.checkoutUrl,
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

async function finalizeXenditPOSCheckoutInternal(
  sessionIdInput: string,
  options: { trustedWebhook?: boolean; recoveryToken?: unknown } = {}
) {
  if (options.trustedWebhook) {
    assertXenditWebhookRecoveryToken(options.recoveryToken);
  }

  const sessionId = cleanText(sessionIdInput);

  if (!sessionId) {
    throw new Error('Xendit session is required.');
  }

  const user = options.trustedWebhook ? null : await requireUser();

  if (user) {
    requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);
  }

  let session = await db.posXenditSession.findFirst({
    where: { id: sessionId, paymentProvider: 'XENDIT' },
  });

  if (!session) {
    throw new Error('Xendit POS session was not found.');
  }

  if (user) {
    assertHotelScope(user, session.hotelId);
  }

  const storedPayload = parseStoredPayload(session.payload);

  if (storedPayload.flow && storedPayload.flow !== 'POS') {
    throw new Error('This Xendit session is not a POS sale.');
  }

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

  if (session.status === POSXenditStatus.PROCESSING) {
    const processingStartedAt = session.processingStartedAt?.getTime() ?? 0;
    const stale = processingStartedAt < Date.now() - 5 * 60 * 1000;

    if (!stale) {
      return {
        ok: false as const,
        waiting: true as const,
        message: 'The paid sale is already being finalized.',
      };
    }

    await db.posXenditSession.updateMany({
      where: {
        id: session.id,
        status: POSXenditStatus.PROCESSING,
        orderCode: null,
      },
      data: {
        status: POSXenditStatus.PAID,
        processingStartedAt: null,
        errorMessage: 'Recovered a stale POS finalization attempt.',
      },
    });

    session = (await db.posXenditSession.findUnique({
      where: { id: session.id },
    }))!;
  }

  if (session.status !== POSXenditStatus.PAID) {
    if (session.status === POSXenditStatus.PENDING) {
      return {
        ok: false as const,
        waiting: true as const,
        message: 'Waiting for Xendit payment confirmation.',
      };
    }

    throw new Error(
      session.errorMessage ||
        `The POS sale cannot be finalized while status is ${session.status}.`
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

  const xenditReference = session.checkoutSessionId || session.id;

  try {
    const orderInput = {
      ...storedPayload,
      paymentMethod: 'POS' as const,
      notes: [
        storedPayload.notes || null,
        `Xendit checkout: ${xenditReference}`,
      ]
        .filter(Boolean)
        .join('\n'),
    };

    // Browser finalization keeps the current permission checks. Webhook
    // recovery uses the immutable cashier identity saved on the session.
    const result = options.trustedWebhook
      ? await createPOSOrderAsUser(
          orderInput,
          session.createdById,
          options.recoveryToken
        )
      : await createPOSOrder(orderInput);

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

/**
 * Trusted webhook-only recovery entry point. It is idempotent and may be
 * called repeatedly when Xendit retries the same completed-payment event.
 */
export async function finalizeXenditPOSSessionById(
  sessionId: string,
  recoveryToken: unknown
) {
  assertXenditWebhookRecoveryToken(recoveryToken);

  return finalizeXenditPOSCheckoutInternal(sessionId, {
    trustedWebhook: true,
    recoveryToken,
  });
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

