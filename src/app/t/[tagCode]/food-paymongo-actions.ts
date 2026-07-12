'use server';

import type { Prisma } from '@prisma/client';
import {
  GuestPayMongoFlow,
  GuestPayMongoStatus,
  MenuProductType,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { cleanText } from '@/lib/sanitize';
import {
  createPayMongoCheckoutSession,
  expirePayMongoCheckoutSession,
  getPayMongoGuestPaymentMethods,
  type PayMongoLineItem,
} from '@/lib/paymongo';
import {
  requireGuestPayMongoSecurityContext,
  requireOwnedGuestPayMongoSession,
} from '@/lib/guest-paymongo-security';
import { createGuestFoodOrder } from '@/lib/guest-food-order';
import { markGuestPaymentFinalizationFailedAndRefund } from '@/lib/guest-paymongo-refund';
import { notifyGuestPayMongoStatus } from '@/lib/paymongo-dashboard-notifications';
import {
  buildScheduledFulfillment,
  parseFulfillmentTiming,
  parseScheduledDate,
} from '@/lib/scheduled-fulfillment';

type GuestFoodCheckoutItem = {
  productId: string;
  quantity: number;
  notes?: string | null;
};

export type GuestFoodPayMongoCheckoutInput = {
  tagCode: string;
  guestName?: string | null;
  notes?: string | null;
  fulfillmentTiming?: string | null;
  scheduledFor?: string | null;
  scheduledNote?: string | null;
  items: GuestFoodCheckoutItem[];
};

type StoredGuestFoodPayload = GuestFoodPayMongoCheckoutInput & {
  paymentMethod: 'PAYMONGO';
};

export type GuestFoodPayMongoStatusResult = {
  ok: boolean;
  status?: GuestPayMongoStatus;
  orderCode?: string | null;
  checkoutUrl?: string | null;
  errorMessage?: string | null;
  refundStatus?: string | null;
  refundedAmountCents?: number;
  shouldClearCart?: boolean;
  error?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
}

function getPublicError(error: unknown, fallback: string) {
  const message = getErrorMessage(error, fallback);

  if (process.env.NODE_ENV !== 'production') {
    return message;
  }

  if (
    /paymongo|secret key|checkout|webhook|app_url|payment id/i.test(message)
  ) {
    return 'Unable to start or confirm the secure payment. Please try again or contact the front desk.';
  }

  return message;
}

function shouldClearCartForPaymentStatus(status: GuestPayMongoStatus) {
  switch (status) {
    case GuestPayMongoStatus.PAID:
    case GuestPayMongoStatus.PROCESSING:
    case GuestPayMongoStatus.COMPLETED:
    case GuestPayMongoStatus.PAID_REVIEW_REQUIRED:
    case GuestPayMongoStatus.REFUND_PENDING:
    case GuestPayMongoStatus.REFUNDED:
    case GuestPayMongoStatus.REFUND_FAILED:
      return true;
    default:
      return false;
  }
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

  const url = new URL(value);

  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('APP_URL must use HTTPS in production.');
  }

  return url.toString().replace(/\/$/, '');
}

function normalizeItems(items: GuestFoodCheckoutItem[]) {
  const map = new Map<string, { quantity: number; notes: string }>();

  for (const rawItem of items ?? []) {
    const productId = cleanText(rawItem.productId);
    const quantity = Number(rawItem.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('The cart contains an invalid item or quantity.');
    }

    const current = map.get(productId);
    map.set(productId, {
      quantity: (current?.quantity ?? 0) + quantity,
      notes: cleanText(rawItem.notes || current?.notes || '', 300) || '',
    });
  }

  const normalized = Array.from(map.entries()).map(([productId, value]) => ({
    productId,
    quantity: value.quantity,
    notes: value.notes,
  }));

  if (!normalized.length) {
    throw new Error('Please add at least one food item.');
  }

  return normalized;
}

async function buildCheckoutQuote(input: GuestFoodPayMongoCheckoutInput) {
  const context = await requireGuestPayMongoSecurityContext(input.tagCode);
  const items = normalizeItems(input.items);
  const productIds = items.map((item) => item.productId);

  const [hotel, products] = await Promise.all([
    db.hotel.findUnique({
      where: { id: context.tag.hotelId },
      include: { settings: true },
    }),
    db.menuProduct.findMany({
      where: {
        id: { in: productIds },
        hotelId: context.tag.hotelId,
        isAvailable: true,
        category: { isActive: true },
      },
      include: {
        images: {
          select: { url: true },
          orderBy: { sortOrder: 'asc' },
          take: 1,
        },
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
          orderBy: { sortOrder: 'asc' },
        },
      },
    }),
  ]);

  if (!hotel || !hotel.isActive) {
    throw new Error('Hotel is unavailable.');
  }

  if ((hotel.settings?.currency || 'PHP').toUpperCase() !== 'PHP') {
    throw new Error('Guest PayMongo checkout currently supports PHP only.');
  }

  if (products.length !== productIds.length) {
    throw new Error('One or more products are no longer available.');
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  const stockRequirements = new Map<string, { name: string; quantity: number }>();

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
          throw new Error(`${product.name} has an unavailable component.`);
        }

        const required = component.quantity * item.quantity;
        const current = stockRequirements.get(component.componentProductId);
        stockRequirements.set(component.componentProductId, {
          name: component.componentProduct.name,
          quantity: (current?.quantity ?? 0) + required,
        });
      }
    } else {
      const current = stockRequirements.get(product.id);
      stockRequirements.set(product.id, {
        name: product.name,
        quantity: (current?.quantity ?? 0) + item.quantity,
      });
    }
  }

  const stocks = await db.menuAvailabilityStock.findMany({
    where: {
      hotelId: context.tag.hotelId,
      productId: { in: Array.from(stockRequirements.keys()) },
    },
  });
  const stockMap = new Map(stocks.map((stock) => [stock.productId, stock]));

  for (const [productId, requirement] of stockRequirements) {
    const stock = stockMap.get(productId);

    if (!stock || stock.isSoldOut || stock.availableQty < requirement.quantity) {
      throw new Error(`${requirement.name} no longer has enough stock.`);
    }
  }

  buildScheduledFulfillment({
    fulfillmentTiming: parseFulfillmentTiming(input.fulfillmentTiming || ''),
    scheduledFor: parseScheduledDate(input.scheduledFor || ''),
    scheduledNote: input.scheduledNote || '',
    releaseBufferMinutes: 20,
  });

  const subtotal = items.reduce((sum, item) => {
    return sum + productMap.get(item.productId)!.priceCents * item.quantity;
  }, 0);
  const serviceCharge = Math.round(
    subtotal * Number(hotel.settings?.serviceChargeRate ?? 0)
  );
  const tax = Math.round(subtotal * Number(hotel.settings?.taxRate ?? 0));
  const total = subtotal + serviceCharge + tax;

  if (total <= 0) {
    throw new Error('The order has no payable amount.');
  }

  const lineItems: PayMongoLineItem[] = items.map((item) => {
    const product = productMap.get(item.productId)!;

    return {
      name: product.name,
      description: product.description || 'CloudView guest food order',
      amount: product.priceCents,
      currency: 'PHP',
      quantity: item.quantity,
      images: product.images[0]?.url ? [product.images[0].url] : undefined,
    };
  });

  if (serviceCharge > 0) {
    lineItems.push({
      name: 'Service charge',
      description: `${Math.round(Number(hotel.settings?.serviceChargeRate ?? 0) * 100)}% service charge`,
      amount: serviceCharge,
      currency: 'PHP',
      quantity: 1,
    });
  }

  if (tax > 0) {
    lineItems.push({
      name: 'Tax',
      description: `${Math.round(Number(hotel.settings?.taxRate ?? 0) * 100)}% tax`,
      amount: tax,
      currency: 'PHP',
      quantity: 1,
    });
  }

  const payload: StoredGuestFoodPayload = {
    tagCode: input.tagCode,
    guestName: cleanText(input.guestName || context.guestName || '', 100) || '',
    notes: cleanText(input.notes || '', 1000) || '',
    paymentMethod: 'PAYMONGO',
    fulfillmentTiming: cleanText(input.fulfillmentTiming || 'ASAP', 40) || 'ASAP',
    scheduledFor: cleanText(input.scheduledFor || '', 80) || '',
    scheduledNote: cleanText(input.scheduledNote || '', 300) || '',
    items,
  };

  return {
    context,
    hotel,
    payload,
    lineItems,
    subtotal,
    serviceCharge,
    tax,
    total,
  };
}

export async function createGuestFoodPayMongoCheckout(
  input: GuestFoodPayMongoCheckoutInput
) {
  try {
    const quote = await buildCheckoutQuote(input);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

    const olderSessions = await db.guestPayMongoSession.findMany({
      where: {
        flowType: GuestPayMongoFlow.FOOD_ORDER,
        guestSessionId: quote.context.session.id,
        status: GuestPayMongoStatus.PENDING,
      },
      select: { id: true, checkoutSessionId: true },
    });

    if (olderSessions.length) {
      await db.guestPayMongoSession.updateMany({
        where: { id: { in: olderSessions.map((session) => session.id) } },
        data: {
          status: GuestPayMongoStatus.CANCELLED,
          cancelledAt: now,
          cancelReason: 'Replaced by a newer guest food checkout.',
        },
      });

      await Promise.allSettled(
        olderSessions
          .map((session) => session.checkoutSessionId)
          .filter((value): value is string => Boolean(value))
          .map((checkoutSessionId) =>
            expirePayMongoCheckoutSession(checkoutSessionId)
          )
      );
    }

    const draft = await db.guestPayMongoSession.create({
      data: {
        flowType: GuestPayMongoFlow.FOOD_ORDER,
        hotelId: quote.context.tag.hotelId,
        tagId: quote.context.tag.id,
        guestSessionId: quote.context.session.id,
        guestStayId: quote.context.guestStayId,
        amountCents: quote.total,
        currency: 'PHP',
        payload: quote.payload as unknown as Prisma.InputJsonValue,
        status: GuestPayMongoStatus.PENDING,
        automaticRefundEnabled: true,
        expiresAt,
      },
      select: { id: true },
    });

    try {
      const appUrl = getAppUrl();
      const basePath = `/t/${encodeURIComponent(input.tagCode)}/payment`;
      const successQuery = new URLSearchParams({
        session: draft.id,
        flow: 'food',
        result: 'success',
      });
      const cancelQuery = new URLSearchParams({
        session: draft.id,
        flow: 'food',
        result: 'cancelled',
      });
      const successUrl = `${appUrl}${basePath}?${successQuery.toString()}`;
      const cancelUrl = `${appUrl}${basePath}?${cancelQuery.toString()}`;

      const checkout = await createPayMongoCheckoutSession({
        idempotencyKey: `cloudview-guest-food-${draft.id}`,
        lineItems: quote.lineItems,
        successUrl,
        cancelUrl,
        description: `${quote.hotel.name} guest food order`,
        referenceNumber: draft.id,
        paymentMethods: getPayMongoGuestPaymentMethods(),
        metadata: {
          flow_type: 'GUEST_FOOD_ORDER',
          guest_payment_session_id: draft.id,
          hotel_id: quote.context.tag.hotelId,
          tag_id: quote.context.tag.id,
          guest_session_id: quote.context.session.id,
          guest_stay_id: quote.context.guestStayId || '',
        },
      });

      await db.guestPayMongoSession.update({
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
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to create PayMongo checkout.');

      await db.guestPayMongoSession.update({
        where: { id: draft.id },
        data: {
          status: GuestPayMongoStatus.FAILED,
          errorMessage: message.slice(0, 2000),
        },
      });

      throw error;
    }
  } catch (error) {
    console.error('[Guest Food PayMongo] Create checkout failed.', error);

    return {
      ok: false as const,
      error: getPublicError(error, 'Unable to create the secure payment.'),
    };
  }
}

export async function getGuestFoodPayMongoStatus(input: {
  tagCode: string;
  paymentSessionId: string;
}): Promise<GuestFoodPayMongoStatusResult> {
  try {
    const { payment } = await requireOwnedGuestPayMongoSession({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
      flowType: GuestPayMongoFlow.FOOD_ORDER,
    });

    if (
      payment.status === GuestPayMongoStatus.PENDING &&
      payment.expiresAt &&
      payment.expiresAt <= new Date()
    ) {
      await db.guestPayMongoSession.updateMany({
        where: {
          id: payment.id,
          status: GuestPayMongoStatus.PENDING,
        },
        data: {
          status: GuestPayMongoStatus.EXPIRED,
          checkoutExpiredAt: new Date(),
          errorMessage: 'The PayMongo checkout expired before payment.',
        },
      });

      if (payment.checkoutSessionId) {
        await expirePayMongoCheckoutSession(payment.checkoutSessionId).catch(
          (error) =>
            console.warn('[Guest Food PayMongo] Unable to expire checkout.', error)
        );
      }

      await notifyGuestPayMongoStatus({ sessionId: payment.id }).catch(
        (error) =>
          console.warn('[Guest Food PayMongo] Unable to notify checkout expiry.', error)
      );

      return {
        ok: true,
        status: GuestPayMongoStatus.EXPIRED,
        orderCode: payment.orderCode,
        errorMessage: 'The PayMongo checkout expired. Please create a new one.',
        refundStatus: payment.refundStatus,
        refundedAmountCents: payment.refundedAmountCents,
        shouldClearCart: false,
      };
    }

    return {
      ok: true,
      status: payment.status,
      orderCode: payment.orderCode,
      checkoutUrl: payment.checkoutUrl,
      errorMessage: payment.errorMessage || payment.refundErrorMessage,
      refundStatus: payment.refundStatus,
      refundedAmountCents: payment.refundedAmountCents,
      shouldClearCart: shouldClearCartForPaymentStatus(payment.status),
    };
  } catch (error) {
    return {
      ok: false,
      error: getPublicError(error, 'Unable to read the payment status.'),
    };
  }
}

export async function cancelGuestFoodPayMongoCheckout(input: {
  tagCode: string;
  paymentSessionId: string;
}) {
  try {
    const { payment } = await requireOwnedGuestPayMongoSession({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
      flowType: GuestPayMongoFlow.FOOD_ORDER,
    });

    if (payment.status === GuestPayMongoStatus.CANCELLED) {
      return { ok: true as const, alreadyCancelled: true as const };
    }

    if (payment.status !== GuestPayMongoStatus.PENDING) {
      return {
        ok: false as const,
        error:
          payment.status === GuestPayMongoStatus.PAID ||
          payment.status === GuestPayMongoStatus.PROCESSING ||
          payment.status === GuestPayMongoStatus.COMPLETED
            ? 'Payment was already received and can no longer be cancelled from checkout.'
            : 'This checkout can no longer be cancelled.',
      };
    }

    await db.guestPayMongoSession.update({
      where: { id: payment.id },
      data: {
        status: GuestPayMongoStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: 'Guest cancelled PayMongo checkout.',
        errorMessage: null,
      },
    });

    if (payment.checkoutSessionId) {
      await expirePayMongoCheckoutSession(payment.checkoutSessionId).catch(
        (error) =>
          console.warn('[Guest Food PayMongo] Unable to expire checkout.', error)
      );
    }

    await notifyGuestPayMongoStatus({ sessionId: payment.id }).catch(
      (error) =>
        console.warn('[Guest Food PayMongo] Unable to notify checkout cancellation.', error)
    );

    return { ok: true as const, alreadyCancelled: false as const };
  } catch (error) {
    return {
      ok: false as const,
      error: getPublicError(error, 'Unable to cancel the checkout.'),
    };
  }
}

function parseStoredPayload(value: Prisma.JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Stored guest food checkout data is invalid.');
  }

  const payload = value as unknown as StoredGuestFoodPayload;

  if (
    typeof payload.tagCode !== 'string' ||
    !Array.isArray(payload.items) ||
    payload.paymentMethod !== 'PAYMONGO'
  ) {
    throw new Error('Stored guest food checkout data is incomplete.');
  }

  return payload;
}

export async function finalizeGuestFoodPayMongoCheckout(input: {
  tagCode: string;
  paymentSessionId: string;
}) {
  try {
    const { payment } = await requireOwnedGuestPayMongoSession({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
      flowType: GuestPayMongoFlow.FOOD_ORDER,
    });

    if (payment.status === GuestPayMongoStatus.COMPLETED && payment.orderCode) {
      return {
        ok: true as const,
        alreadyFinalized: true as const,
        orderCode: payment.orderCode,
      };
    }

    if (payment.status === GuestPayMongoStatus.PROCESSING) {
      const processingStartedAt = payment.processingStartedAt?.getTime() ?? 0;
      const stale = processingStartedAt < Date.now() - 5 * 60 * 1000;

      if (!stale) {
        return {
          ok: false as const,
          waiting: true as const,
          message: 'Your paid order is already being finalized.',
        };
      }

      await db.guestPayMongoSession.updateMany({
        where: {
          id: payment.id,
          status: GuestPayMongoStatus.PROCESSING,
          orderId: null,
        },
        data: {
          status: GuestPayMongoStatus.PAID,
          processingStartedAt: null,
          errorMessage: 'Recovered a stale order finalization attempt.',
        },
      });
    }

    const current = await db.guestPayMongoSession.findUnique({
      where: { id: payment.id },
    });

    if (!current) {
      throw new Error('Guest PayMongo session was not found.');
    }

    if (current.status !== GuestPayMongoStatus.PAID) {
      if (current.status === GuestPayMongoStatus.PENDING) {
        return {
          ok: false as const,
          waiting: true as const,
          message: 'Waiting for PayMongo payment confirmation.',
        };
      }

      throw new Error(
        current.errorMessage ||
          current.refundErrorMessage ||
          `Payment cannot be finalized while status is ${current.status}.`
      );
    }

    const claimed = await db.guestPayMongoSession.updateMany({
      where: {
        id: current.id,
        status: GuestPayMongoStatus.PAID,
        orderId: null,
      },
      data: {
        status: GuestPayMongoStatus.PROCESSING,
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

    const payload = parseStoredPayload(current.payload);

    try {
      const order = await createGuestFoodOrder(
        {
          tagCode: payload.tagCode,
          guestName: payload.guestName,
          notes: payload.notes,
          paymentMethod: PaymentMethod.PAYMONGO,
          fulfillmentTiming: payload.fulfillmentTiming,
          scheduledFor: payload.scheduledFor,
          scheduledNote: payload.scheduledNote,
          items: payload.items,
        },
        {
          paymentStatus: PaymentStatus.PAID,
          guestPayMongoSessionId: current.id,
        }
      );

      return {
        ok: true as const,
        alreadyFinalized: false as const,
        orderCode: order.orderCode,
      };
    } catch (error) {
      await markGuestPaymentFinalizationFailedAndRefund({
        sessionId: current.id,
        error,
      });

      throw new Error(
        `Payment was received, but the food order could not be completed. A PayMongo refund was requested automatically. ${getErrorMessage(
          error,
          ''
        )}`.trim()
      );
    }
  } catch (error) {
    console.error('[Guest Food PayMongo] Finalization failed.', error);

    return {
      ok: false as const,
      waiting: false as const,
      error: getPublicError(error, 'Unable to finalize the paid food order.'),
    };
  }
}