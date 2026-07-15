'use server';

import type { Prisma } from '@prisma/client';
import {
  GuestXenditFlow,
  GuestXenditStatus,
  MenuProductType,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { assertXenditWebhookRecoveryToken } from '@/lib/xendit-webhook-recovery-token';
import { cleanText } from '@/lib/sanitize';
import {
  createXenditCheckoutSession,
  cancelXenditCheckoutSessionIfActive,
  expireXenditCheckoutSession,
  getXenditGuestPaymentMethods,
  type XenditLineItem,
} from '@/lib/xendit';
import { buildGuestXenditReturnUrl } from '@/lib/xendit-guest-return';
import {
  createXenditIntentFingerprint,
  decideExistingXenditSession,
  readXenditIntentFingerprint,
} from '@/lib/xendit-session-policy';
import { requireOwnedGuestXenditSession } from '@/lib/guest-xendit-security';
import { resolveGuestOrderIdentity } from '@/lib/guest-order-identity';
import { createGuestFoodOrder } from '@/lib/guest-food-order';
import { markGuestPaymentFinalizationFailedAndRefund } from '@/lib/guest-xendit-refund';
import { notifyGuestXenditStatus } from '@/lib/xendit-dashboard-notifications';
import {
  buildXenditSplitConfiguration,
  getXenditForUserIdFromPayload,
  type XenditSplitSnapshot,
} from '@/lib/xendit-split';
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

export type GuestFoodXenditCheckoutInput = {
  tagCode: string;
  guestName?: string | null;
  guestPhone?: string | null;
  notes?: string | null;
  orderType?: 'ROOM_SERVICE' | 'DINE_IN' | 'TAKE_OUT' | 'PICK_UP' | null;
  roomNumber?: string | null;
  roomPasscode?: string | null;
  fulfillmentTiming?: string | null;
  scheduledFor?: string | null;
  scheduledNote?: string | null;
  items: GuestFoodCheckoutItem[];
};

type StoredGuestFoodPayload = GuestFoodXenditCheckoutInput & {
  paymentMethod: 'XENDIT';
  xenditSplit: XenditSplitSnapshot | null;
  paymentIntentFingerprint?: string;
  xenditExpiresAt?: string;
};

export type GuestFoodXenditStatusResult = {
  ok: boolean;
  status?: GuestXenditStatus;
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
    /xendit|secret key|checkout|webhook|app_url|payment id/i.test(message)
  ) {
    return 'Unable to start or confirm the secure payment. Please try again or contact the front desk.';
  }

  return message;
}

function shouldClearCartForPaymentStatus(status: GuestXenditStatus) {
  switch (status) {
    case GuestXenditStatus.PAID:
    case GuestXenditStatus.PROCESSING:
    case GuestXenditStatus.COMPLETED:
    case GuestXenditStatus.PAID_REVIEW_REQUIRED:
    case GuestXenditStatus.REFUND_PENDING:
    case GuestXenditStatus.REFUNDED:
    case GuestXenditStatus.REFUND_FAILED:
      return true;
    default:
      return false;
  }
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

async function buildCheckoutQuote(input: GuestFoodXenditCheckoutInput) {
  const orderType = input.orderType || 'ROOM_SERVICE';
  const resolvedIdentity = await resolveGuestOrderIdentity({
    tagCode: input.tagCode,
    guestName: input.guestName,
    guestPhone: input.guestPhone,
    roomNumber: input.roomNumber,
    roomPasscode: input.roomPasscode,
    requireRoomAssignment: orderType === 'ROOM_SERVICE',
  });
  const context = resolvedIdentity.context;
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
    throw new Error('Guest Xendit checkout currently supports PHP only.');
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

  const lineItems: XenditLineItem[] = items.map((item) => {
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

  const splitConfiguration = await buildXenditSplitConfiguration({
    hotelId: hotel.id,
    amountCents: total,
    settings: hotel.settings,
  });

  const payload: StoredGuestFoodPayload = {
    tagCode: input.tagCode,
    guestName: resolvedIdentity.guestName,
    guestPhone: resolvedIdentity.guestPhone,
    notes: cleanText(input.notes || '', 1000) || '',
    orderType,
    roomNumber: resolvedIdentity.assignedRoomNumber || '',
    roomPasscode: '',
    paymentMethod: 'XENDIT',
    fulfillmentTiming: cleanText(input.fulfillmentTiming || 'ASAP', 40) || 'ASAP',
    scheduledFor: cleanText(input.scheduledFor || '', 80) || '',
    scheduledNote: cleanText(input.scheduledNote || '', 300) || '',
    items,
    xenditSplit: splitConfiguration?.snapshot ?? null,
  };

  return {
    context,
    resolvedIdentity,
    hotel,
    payload,
    lineItems,
    subtotal,
    serviceCharge,
    tax,
    total,
    splitConfiguration,
  };
}

function createGuestFoodIntentFingerprint(input: {
  payload: StoredGuestFoodPayload;
  amountCents: number;
}) {
  return createXenditIntentFingerprint({
    flow: 'GUEST_FOOD_ORDER',
    tagCode: input.payload.tagCode,
    guestName: input.payload.guestName || '',
    guestPhone: input.payload.guestPhone || '',
    orderType: input.payload.orderType || 'ROOM_SERVICE',
    roomNumber: input.payload.roomNumber || '',
    notes: input.payload.notes || '',
    fulfillmentTiming: input.payload.fulfillmentTiming || 'ASAP',
    scheduledFor: input.payload.scheduledFor || '',
    scheduledNote: input.payload.scheduledNote || '',
    items: [...input.payload.items]
      .map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        notes: item.notes || '',
      }))
      .sort((left, right) => left.productId.localeCompare(right.productId)),
    amountCents: input.amountCents,
    split: input.payload.xenditSplit,
  });
}

function getStoredGuestFoodFingerprint(
  payload: Prisma.JsonValue,
  amountCents: number
) {
  const stored = readXenditIntentFingerprint(payload);
  if (stored) return stored;

  try {
    return createGuestFoodIntentFingerprint({
      payload: parseStoredPayload(payload),
      amountCents,
    });
  } catch {
    return null;
  }
}

async function cancelSupersededGuestFoodSession(session: {
  id: string;
  checkoutSessionId: string | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
}, reason: string) {
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
        'The previous Xendit checkout was already paid. Wait for confirmation before changing the order.'
      );
    }
  }

  await db.guestXenditSession.updateMany({
    where: {
      id: session.id,
      status: GuestXenditStatus.PENDING,
    },
    data: {
      status: GuestXenditStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelReason: reason,
      errorMessage: null,
    },
  });
}

export async function createGuestFoodXenditCheckout(
  input: GuestFoodXenditCheckoutInput
) {
  try {
    const quote = await buildCheckoutQuote(input);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const paymentIntentFingerprint = createGuestFoodIntentFingerprint({
      payload: quote.payload,
      amountCents: quote.total,
    });
    const storedPayload: StoredGuestFoodPayload = {
      ...quote.payload,
      paymentIntentFingerprint,
      xenditExpiresAt: expiresAt.toISOString(),
    };

    const pendingSessions = await db.guestXenditSession.findMany({
      where: {
        paymentProvider: 'XENDIT',
        flowType: GuestXenditFlow.FOOD_ORDER,
        guestSessionId: quote.context.session.id,
        status: GuestXenditStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        amountCents: true,
        checkoutSessionId: true,
        checkoutUrl: true,
        payload: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    for (const session of pendingSessions) {
      const sameIntent =
        getStoredGuestFoodFingerprint(session.payload, session.amountCents) ===
        paymentIntentFingerprint;
      const decision = await decideExistingXenditSession({
        checkoutSessionId: session.checkoutSessionId,
        checkoutUrl: session.checkoutUrl,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        forUserId: getXenditForUserIdFromPayload(session.payload),
      });

      if (decision.action === 'COMPLETED') {
        const amountMatches =
          decision.amountCents === null ||
          decision.amountCents === session.amountCents;
        const currencyMatches =
          !decision.currency || decision.currency === 'PHP';
        const nextStatus =
          amountMatches && currencyMatches
            ? GuestXenditStatus.PAID
            : GuestXenditStatus.PAID_REVIEW_REQUIRED;

        await db.guestXenditSession.update({
          where: { id: session.id },
          data: {
            status: nextStatus,
            xenditPaymentId: decision.paymentId,
            xenditPaymentRequestId: decision.paymentRequestId,
            paidAmountCents: decision.amountCents ?? session.amountCents,
            paidAt: now,
            errorMessage:
              amountMatches && currencyMatches
                ? null
                : 'The completed Xendit session amount or currency did not match the stored food order.',
          },
        });

        return {
          ok: false as const,
          existingSession: true as const,
          paymentCompleted: true as const,
          sessionId: session.id,
          checkoutUrl: buildGuestXenditReturnUrl({
            tagCode: input.tagCode,
            sessionId: session.id,
            flow: 'food',
            result: 'success',
          }),
          status: nextStatus,
          error:
            'An earlier Xendit payment was already received. CloudView is finalizing that food order; a second payment is blocked.',
        };
      }

      if (decision.action === 'CONTINUE') {
        await db.guestXenditSession.update({
          where: { id: session.id },
          data: {
            checkoutSessionId: decision.checkoutSessionId,
            checkoutUrl: decision.checkoutUrl,
            expiresAt: decision.expiresAt,
            xenditPaymentRequestId:
              decision.paymentRequestId ?? undefined,
            payload: {
              ...(session.payload as Prisma.JsonObject),
              paymentIntentFingerprint:
                sameIntent
                  ? paymentIntentFingerprint
                  : readXenditIntentFingerprint(session.payload) || '',
              xenditExpiresAt:
                decision.expiresAt?.toISOString() ??
                storedPayload.xenditExpiresAt ??
                '',
            } as Prisma.InputJsonValue,
            errorMessage: null,
          },
        });

        if (sameIntent) {
          return {
            ok: true as const,
            sessionId: session.id,
            checkoutUrl: decision.checkoutUrl,
            expiresAt:
              decision.expiresAt?.toISOString() ?? expiresAt.toISOString(),
            reusedSession: true as const,
          };
        }

        return {
          ok: false as const,
          existingSession: true as const,
          sessionId: session.id,
          checkoutUrl: decision.checkoutUrl,
          status: GuestXenditStatus.PENDING,
          error:
            'A Xendit food checkout is already active. Continue or cancel it before changing the order.',
        };
      }

      if (decision.action === 'WAIT') {
        return {
          ok: false as const,
          existingSession: true as const,
          sessionId: session.id,
          checkoutUrl: session.checkoutUrl,
          status: GuestXenditStatus.PENDING,
          error: decision.reason,
        };
      }

      // Only an expired, cancelled, failed, or unusable remote session may be
      // replaced automatically. Active sessions are always surfaced to the UI.
      await cancelSupersededGuestFoodSession(session, decision.reason);
    }

    if (quote.resolvedIdentity.guestStayId) {
      const boundSession = await db.nfcGuestSession.updateMany({
        where: {
          id: quote.context.session.id,
          hotelId: quote.context.tag.hotelId,
          tagId: quote.context.tag.id,
          endedAt: null,
        },
        data: {
          roomId: quote.resolvedIdentity.roomId,
          locationId: quote.resolvedIdentity.locationId,
          guestStayId: quote.resolvedIdentity.guestStayId,
          guestMemberId: quote.resolvedIdentity.guestMemberId,
          lastSeenAt: new Date(),
        },
      });

      if (boundSession.count !== 1) {
        throw new Error(
          'The NFC browser session ended before the room could be verified.'
        );
      }
    }

    const draft = await db.guestXenditSession.create({
      data: {
        paymentProvider: 'XENDIT',
        flowType: GuestXenditFlow.FOOD_ORDER,
        hotelId: quote.context.tag.hotelId,
        tagId: quote.context.tag.id,
        guestSessionId: quote.context.session.id,
        guestStayId: quote.resolvedIdentity.guestStayId,
        amountCents: quote.total,
        currency: 'PHP',
        payload: storedPayload as unknown as Prisma.InputJsonValue,
        status: GuestXenditStatus.PENDING,
        automaticRefundEnabled: true,
        expiresAt,
      },
      select: { id: true },
    });

    try {
      const successUrl = buildGuestXenditReturnUrl({
        tagCode: input.tagCode,
        sessionId: draft.id,
        flow: 'food',
        result: 'success',
      });
      const cancelUrl = buildGuestXenditReturnUrl({
        tagCode: input.tagCode,
        sessionId: draft.id,
        flow: 'food',
        result: 'cancelled',
      });

      const checkout = await createXenditCheckoutSession({
        idempotencyKey: `cloudview-guest-food-${draft.id}`,
        lineItems: quote.lineItems,
        successUrl,
        cancelUrl,
        description: `${quote.hotel.name} guest food order`,
        referenceNumber: draft.id,
        paymentMethods: getXenditGuestPaymentMethods(),
        metadata: {
          flow_type: 'GUEST_FOOD_ORDER',
          guest_payment_session_id: draft.id,
          hotel_id: quote.context.tag.hotelId,
          tag_id: quote.context.tag.id,
          guest_session_id: quote.context.session.id,
          guest_stay_id: quote.resolvedIdentity.guestStayId || '',
          payment_intent: paymentIntentFingerprint.slice(0, 40),
          split_enabled: quote.splitConfiguration ? 'true' : 'false',
          split_fee_bearer:
            quote.splitConfiguration?.snapshot.feeBearer ?? '',
        },
        splitPayment: quote.splitConfiguration?.splitPayment,
        expiresAt,
      });

      await db.guestXenditSession.update({
        where: { id: draft.id },
        data: {
          checkoutSessionId: checkout.id,
          checkoutUrl: checkout.checkoutUrl,
          xenditPaymentRequestId: checkout.paymentRequestId,
          expiresAt: new Date(checkout.expiresAt),
          payload: {
            ...storedPayload,
            xenditExpiresAt: checkout.expiresAt,
          } as unknown as Prisma.InputJsonValue,
          errorMessage: null,
        },
      });

      return {
        ok: true as const,
        sessionId: draft.id,
        checkoutUrl: checkout.checkoutUrl,
        expiresAt: checkout.expiresAt,
        reusedSession: false as const,
      };
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to create Xendit checkout.');

      await db.guestXenditSession.update({
        where: { id: draft.id },
        data: {
          status: GuestXenditStatus.FAILED,
          errorMessage: message.slice(0, 2000),
        },
      });

      throw error;
    }
  } catch (error) {
    console.error('[Guest Food Xendit] Create checkout failed.', error);

    return {
      ok: false as const,
      error: getPublicError(error, 'Unable to create the secure payment.'),
    };
  }
}

export async function getGuestFoodXenditStatus(input: {
  tagCode: string;
  paymentSessionId: string;
}): Promise<GuestFoodXenditStatusResult> {
  try {
    const { payment } = await requireOwnedGuestXenditSession({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
      flowType: GuestXenditFlow.FOOD_ORDER,
    });

    if (
      payment.status === GuestXenditStatus.PENDING &&
      payment.expiresAt &&
      payment.expiresAt <= new Date()
    ) {
      await db.guestXenditSession.updateMany({
        where: {
          id: payment.id,
          status: GuestXenditStatus.PENDING,
        },
        data: {
          status: GuestXenditStatus.EXPIRED,
          checkoutExpiredAt: new Date(),
          errorMessage: 'The Xendit checkout expired before payment.',
        },
      });

      if (payment.checkoutSessionId) {
        await expireXenditCheckoutSession(
          payment.checkoutSessionId,
          getXenditForUserIdFromPayload(payment.payload)
        ).catch(
          (error) =>
            console.warn('[Guest Food Xendit] Unable to expire checkout.', error)
        );
      }

      await notifyGuestXenditStatus({ sessionId: payment.id }).catch(
        (error) =>
          console.warn('[Guest Food Xendit] Unable to notify checkout expiry.', error)
      );

      return {
        ok: true,
        status: GuestXenditStatus.EXPIRED,
        orderCode: payment.orderCode,
        errorMessage: 'The Xendit checkout expired. Please create a new one.',
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

export async function cancelGuestFoodXenditCheckout(input: {
  tagCode: string;
  paymentSessionId: string;
}) {
  try {
    const { payment } = await requireOwnedGuestXenditSession({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
      flowType: GuestXenditFlow.FOOD_ORDER,
    });

    if (payment.status === GuestXenditStatus.CANCELLED) {
      return { ok: true as const, alreadyCancelled: true as const };
    }

    if (payment.status !== GuestXenditStatus.PENDING) {
      const paymentCompleted =
        payment.status === GuestXenditStatus.PAID ||
        payment.status === GuestXenditStatus.PROCESSING ||
        payment.status === GuestXenditStatus.COMPLETED ||
        payment.status === GuestXenditStatus.PAID_REVIEW_REQUIRED;

      return {
        ok: false as const,
        ...(paymentCompleted ? { paymentCompleted: true as const } : {}),
        error: paymentCompleted
          ? 'Payment was already received and can no longer be cancelled from checkout.'
          : 'This checkout can no longer be cancelled.',
      };
    }

    if (payment.checkoutSessionId) {
      const remote = await cancelXenditCheckoutSessionIfActive(
        payment.checkoutSessionId,
        getXenditForUserIdFromPayload(payment.payload)
      );

      if (remote.status === 'COMPLETED') {
        const amountMatches =
          remote.amountCents === null || remote.amountCents === payment.amountCents;
        const currencyMatches =
          !remote.currency || remote.currency === payment.currency.toUpperCase();

        await db.guestXenditSession.updateMany({
          where: { id: payment.id, status: GuestXenditStatus.PENDING },
          data: {
            status:
              amountMatches && currencyMatches
                ? GuestXenditStatus.PAID
                : GuestXenditStatus.PAID_REVIEW_REQUIRED,
            xenditPaymentId: remote.paymentId,
            xenditPaymentRequestId: remote.paymentRequestId,
            paidAmountCents: remote.amountCents ?? payment.amountCents,
            paidAt: new Date(),
            errorMessage:
              amountMatches && currencyMatches
                ? null
                : 'The completed Xendit session amount or currency did not match the stored food order.',
          },
        });

        await notifyGuestXenditStatus({ sessionId: payment.id }).catch(
          () => undefined
        );

        return {
          ok: false as const,
          paymentCompleted: true as const,
          error: 'Payment was already completed and can no longer be cancelled.',
        };
      }
    }

    await db.guestXenditSession.updateMany({
      where: { id: payment.id, status: GuestXenditStatus.PENDING },
      data: {
        status: GuestXenditStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: 'Guest cancelled Xendit checkout.',
        errorMessage: null,
      },
    });

    await notifyGuestXenditStatus({ sessionId: payment.id }).catch(
      (error) =>
        console.warn('[Guest Food Xendit] Unable to notify checkout cancellation.', error)
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
    payload.paymentMethod !== 'XENDIT'
  ) {
    throw new Error('Stored guest food checkout data is incomplete.');
  }

  return payload;
}

async function finalizeGuestFoodXenditSessionInternal(
  paymentSessionIdInput: string
) {
  const paymentSessionId = cleanText(paymentSessionIdInput, 120);

  if (!paymentSessionId) {
    throw new Error('Guest Xendit session is required.');
  }

  const payment = await db.guestXenditSession.findFirst({
    where: {
      id: paymentSessionId,
      paymentProvider: 'XENDIT',
      flowType: GuestXenditFlow.FOOD_ORDER,
    },
  });

  if (!payment) {
    throw new Error('Guest Xendit food session was not found.');
  }

  if (payment.status === GuestXenditStatus.COMPLETED && payment.orderCode) {
    return {
      ok: true as const,
      alreadyFinalized: true as const,
      orderCode: payment.orderCode,
    };
  }

  if (payment.status === GuestXenditStatus.PROCESSING) {
    const processingStartedAt = payment.processingStartedAt?.getTime() ?? 0;
    const stale = processingStartedAt < Date.now() - 5 * 60 * 1000;

    if (!stale) {
      return {
        ok: false as const,
        waiting: true as const,
        message: 'Your paid order is already being finalized.',
      };
    }

    await db.guestXenditSession.updateMany({
      where: {
        id: payment.id,
        status: GuestXenditStatus.PROCESSING,
        orderId: null,
      },
      data: {
        status: GuestXenditStatus.PAID,
        processingStartedAt: null,
        errorMessage: 'Recovered a stale order finalization attempt.',
      },
    });
  }

  const current = await db.guestXenditSession.findUnique({
    where: { id: payment.id },
  });

  if (!current) {
    throw new Error('Guest Xendit session was not found.');
  }

  if (current.status !== GuestXenditStatus.PAID) {
    if (current.status === GuestXenditStatus.PENDING) {
      return {
        ok: false as const,
        waiting: true as const,
        message: 'Waiting for Xendit payment confirmation.',
      };
    }

    throw new Error(
      current.errorMessage ||
        current.refundErrorMessage ||
        `Payment cannot be finalized while status is ${current.status}.`
    );
  }

  const claimed = await db.guestXenditSession.updateMany({
    where: {
      id: current.id,
      status: GuestXenditStatus.PAID,
      orderId: null,
    },
    data: {
      status: GuestXenditStatus.PROCESSING,
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
        guestPhone: payload.guestPhone,
        notes: payload.notes,
        orderType: payload.orderType,
        roomNumber: payload.roomNumber,
        roomPasscode: '',
        paymentMethod: PaymentMethod.XENDIT,
        fulfillmentTiming: payload.fulfillmentTiming,
        scheduledFor: payload.scheduledFor,
        scheduledNote: payload.scheduledNote,
        items: payload.items,
      },
      {
        paymentStatus: PaymentStatus.PAID,
        guestXenditSessionId: current.id,
        verifiedGuestStayId: current.guestStayId,
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
      `Payment was received, but the food order could not be completed. A Xendit refund was requested automatically. ${getErrorMessage(
        error,
        ''
      )}`.trim()
    );
  }
}

/**
 * Idempotent webhook recovery. The Xendit callback token and session lookup
 * are the trust boundary, so no browser cookie is required to create the paid
 * order after the guest closes or backs out of the hosted checkout.
 */
export async function finalizeGuestFoodXenditSessionById(
  paymentSessionId: string,
  recoveryToken: unknown
) {
  assertXenditWebhookRecoveryToken(recoveryToken);

  return finalizeGuestFoodXenditSessionInternal(paymentSessionId);
}

export async function finalizeGuestFoodXenditCheckout(input: {
  tagCode: string;
  paymentSessionId: string;
}) {
  try {
    const { payment } = await requireOwnedGuestXenditSession({
      tagCode: input.tagCode,
      paymentSessionId: input.paymentSessionId,
      flowType: GuestXenditFlow.FOOD_ORDER,
    });

    return await finalizeGuestFoodXenditSessionInternal(payment.id);
  } catch (error) {
    console.error('[Guest Food Xendit] Finalization failed.', error);

    return {
      ok: false as const,
      waiting: false as const,
      error: getPublicError(error, 'Unable to finalize the paid food order.'),
    };
  }
}
