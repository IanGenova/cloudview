'use server';

import type { Prisma } from '@prisma/client';
import {
  MenuProductType,
  POSPayMongoStatus,
  ServiceBillingMode,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { assertHotelScope } from '@/lib/access';
import { requireRole, requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  createPayMongoCheckoutSession,
  type PayMongoLineItem,
} from '@/lib/paymongo';
import { cleanText } from '@/lib/sanitize';
import { notifyPosPayMongoStatus } from '@/lib/paymongo-dashboard-notifications';
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
};

export type CreatePayMongoPOSCheckoutResult =
  | {
      ok: true;
      sessionId: string;
      checkoutUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

export type PayMongoPOSStatusResult =
  | {
      ok: true;
      id: string;
      status: POSPayMongoStatus;
      orderCode: string | null;
      serviceRequestCodes: string[];
      errorMessage: string | null;
    }
  | {
      ok: false;
      error: string;
    };

export type FinalizePayMongoPOSCheckoutResult =
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

function getPublicPayMongoError(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback);

  if (process.env.NODE_ENV !== 'production') {
    return message;
  }

  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes('paymongo') ||
    lowerMessage.includes('secret key') ||
    lowerMessage.includes('app_url') ||
    lowerMessage.includes('checkout session') ||
    lowerMessage.includes('request failed')
  ) {
    return 'Unable to start the secure PayMongo checkout. Please verify the payment configuration or use another payment method.';
  }

  return message;
}

function logPayMongoActionError(
  operation: string,
  error: unknown,
  context: Record<string, string | null | undefined> = {}
) {
  console.error(`[POS PayMongo] ${operation} failed.`, {
    ...context,
    message: getErrorMessage(error, 'Unknown PayMongo error.'),
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

function getAppUrl() {
  const value = (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ''
  ).replace(/\/$/, '');

  if (!value) {
    throw new Error('APP_URL is not configured.');
  }

  if (process.env.NODE_ENV === 'production' && !value.startsWith('https://')) {
    throw new Error('APP_URL must use HTTPS in production.');
  }

  return value;
}

function parseStoredPayload(value: Prisma.JsonValue): StoredPOSPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored PayMongo cart data is invalid.');
  }

  const payload = value as unknown as StoredPOSPayload;

  if (
    typeof payload.hotelId !== 'string' ||
    !Array.isArray(payload.items) ||
    !Array.isArray(payload.services)
  ) {
    throw new Error('Stored PayMongo cart data is incomplete.');
  }

  return payload;
}

async function createPayMongoPOSCheckoutInternal(input: CheckoutInput) {
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
    throw new Error('PayMongo checkout currently requires PHP currency.');
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

  const lineItems: PayMongoLineItem[] = [];
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

  const payload: StoredPOSPayload = {
    hotelId,
    roomId,
    guestName,
    notes,
    items,
    services,
  };

  const draft = await db.posPayMongoSession.create({
    data: {
      hotelId,
      createdById: user.id,
      amountCents,
      currency: 'PHP',
      payload: payload as unknown as Prisma.InputJsonValue,
      status: POSPayMongoStatus.PENDING,
    },
    select: {
      id: true,
    },
  });

  try {
    const appUrl = getAppUrl();
    const query = new URLSearchParams({
      hotelId,
      paymongo: draft.id,
    });

    const successUrl = `${appUrl}/dashboard/pos?${query.toString()}&paymongoResult=success`;
    const cancelUrl = `${appUrl}/dashboard/pos?${query.toString()}&paymongoResult=cancelled`;

    const checkout = await createPayMongoCheckoutSession({
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
      },
    });

    await db.posPayMongoSession.update({
      where: { id: draft.id },
      data: {
        checkoutSessionId: checkout.id,
        checkoutUrl: checkout.checkoutUrl,
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
      'Unable to create PayMongo checkout.'
    );

    try {
      await db.posPayMongoSession.update({
        where: { id: draft.id },
        data: {
          status: POSPayMongoStatus.FAILED,
          errorMessage: message.slice(0, 2000),
        },
      });

      await notifyPosPayMongoStatus({ sessionId: draft.id }).catch(
        (notificationError) =>
          console.warn(
            '[POS PayMongo] Unable to create failed-payment notification.',
            notificationError
          )
      );
    } catch (updateError) {
      logPayMongoActionError('mark checkout as failed', updateError, {
        hotelId,
        sessionId: draft.id,
      });
    }

    throw error instanceof Error ? error : new Error(message);
  }
}

export async function createPayMongoPOSCheckout(
  input: CheckoutInput
): Promise<CreatePayMongoPOSCheckoutResult> {
  try {
    return await createPayMongoPOSCheckoutInternal(input);
  } catch (error) {
    logPayMongoActionError('create checkout', error, {
      hotelId:
        typeof input?.hotelId === 'string'
          ? input.hotelId
          : null,
    });

    return {
      ok: false,
      error: getPublicPayMongoError(
        error,
        'Unable to create PayMongo checkout.'
      ),
    };
  }
}

async function getPayMongoPOSStatusInternal(sessionIdInput: string) {
  const user = await requireUser();
  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const sessionId = cleanText(sessionIdInput);

  if (!sessionId) {
    throw new Error('PayMongo session is required.');
  }

  const session = await db.posPayMongoSession.findUnique({
    where: { id: sessionId },
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
    throw new Error('PayMongo POS session was not found.');
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

export async function getPayMongoPOSStatus(
  sessionIdInput: string
): Promise<PayMongoPOSStatusResult> {
  try {
    return await getPayMongoPOSStatusInternal(sessionIdInput);
  } catch (error) {
    logPayMongoActionError('read checkout status', error, {
      sessionId:
        typeof sessionIdInput === 'string'
          ? sessionIdInput
          : null,
    });

    return {
      ok: false,
      error: getPublicPayMongoError(
        error,
        'Unable to read the PayMongo payment status.'
      ),
    };
  }
}

async function finalizePayMongoPOSCheckoutInternal(sessionIdInput: string) {
  const user = await requireUser();
  requireRole(user.role, ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF']);

  const sessionId = cleanText(sessionIdInput);

  if (!sessionId) {
    throw new Error('PayMongo session is required.');
  }

  const session = await db.posPayMongoSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new Error('PayMongo POS session was not found.');
  }

  assertHotelScope(user, session.hotelId);

  if (session.status === POSPayMongoStatus.COMPLETED) {
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

  if (session.status !== POSPayMongoStatus.PAID) {
    if (session.status === POSPayMongoStatus.PROCESSING) {
      return {
        ok: false as const,
        waiting: true as const,
        message: 'The paid sale is already being finalized.',
      };
    }

    throw new Error(
      session.errorMessage || 'Waiting for PayMongo payment confirmation.'
    );
  }

  const claimed = await db.posPayMongoSession.updateMany({
    where: {
      id: session.id,
      status: POSPayMongoStatus.PAID,
    },
    data: {
      status: POSPayMongoStatus.PROCESSING,
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
  const payMongoReference = session.checkoutSessionId || session.id;

  try {
    // Existing createPOSOrder remains the single source of truth for stock,
    // kitchen routing, service requests, audit logs, and room add-on charges.
    const result = await createPOSOrder({
      ...payload,
      paymentMethod: 'POS',
      notes: [
        payload.notes || null,
        `PayMongo checkout: ${payMongoReference}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    await db.posPayMongoSession.update({
      where: { id: session.id },
      data: {
        status: POSPayMongoStatus.COMPLETED,
        orderCode: result.orderCode,
        serviceRequestCodes:
          result.serviceRequestCodes as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    await notifyPosPayMongoStatus({ sessionId: session.id }).catch(
      (notificationError) =>
        console.warn(
          '[POS PayMongo] Unable to create completion notification.',
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

    await db.posPayMongoSession.update({
      where: { id: session.id },
      data: {
        status: POSPayMongoStatus.PAID_REVIEW_REQUIRED,
        errorMessage: message,
      },
    });

    await notifyPosPayMongoStatus({ sessionId: session.id }).catch(
      (notificationError) =>
        console.warn(
          '[POS PayMongo] Unable to create review notification.',
          notificationError
        )
    );

    throw new Error(
      `Payment received, but the sale could not be finalized: ${message}`
    );
  }
}

export async function finalizePayMongoPOSCheckout(
  sessionIdInput: string
): Promise<FinalizePayMongoPOSCheckoutResult> {
  try {
    return await finalizePayMongoPOSCheckoutInternal(sessionIdInput);
  } catch (error) {
    logPayMongoActionError('finalize paid checkout', error, {
      sessionId:
        typeof sessionIdInput === 'string'
          ? sessionIdInput
          : null,
    });

    return {
      ok: false,
      waiting: false,
      error: getPublicPayMongoError(
        error,
        'The payment could not be finalized.'
      ),
    };
  }
}

