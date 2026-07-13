import 'server-only';

import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import {
  GuestXenditFlow,
  GuestXenditRefundKind,
  GuestXenditRefundStatus,
  GuestXenditStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { createXenditRefund } from '@/lib/xendit';
import {
  notifyGuestXenditRefundStatus,
  notifyGuestXenditStatus,
} from '@/lib/xendit-dashboard-notifications';


async function safelyNotifyGuestPayment(sessionId: string) {
  try {
    await notifyGuestXenditStatus({ sessionId });
  } catch (error) {
    console.warn('[Guest Xendit] Unable to create payment notification.', {
      sessionId,
      error,
    });
  }
}

async function safelyNotifyGuestRefund(refundId: string) {
  try {
    await notifyGuestXenditRefundStatus({ refundId });
  } catch (error) {
    console.warn('[Guest Xendit] Unable to create refund notification.', {
      refundId,
      error,
    });
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
}

function mapXenditRefundStatus(value: string): GuestXenditRefundStatus {
  if (value === 'succeeded') {
    return GuestXenditRefundStatus.SUCCEEDED;
  }

  if (value === 'failed') {
    return GuestXenditRefundStatus.FAILED;
  }

  if (value === 'processing') {
    return GuestXenditRefundStatus.PROCESSING;
  }

  return GuestXenditRefundStatus.PENDING;
}

function safeIdempotencyKey(input: string) {
  const compact = input.replace(/[^a-zA-Z0-9_-]/g, '-');

  if (compact.length <= 180) {
    return compact;
  }

  const digest = createHash('sha256').update(compact).digest('hex').slice(0, 24);
  return `${compact.slice(0, 150)}-${digest}`;
}

const MANUAL_REFUND_REQUIRED_PREFIX = 'MANUAL REFUND REQUIRED:';

const NON_REFUNDABLE_XENDIT_SOURCES = new Set([
  'qrph',
  'qr_ph',
  'qr-ph',
  'qr',
]);

function normalizePaymentSourceType(value?: string | null) {
  return String(value ?? '').trim().toLowerCase();
}

function getRefundForUserId(payload: Prisma.JsonValue) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const split = (payload as Prisma.JsonObject).xenditSplit;
  if (!split || typeof split !== 'object' || Array.isArray(split)) {
    return null;
  }

  const snapshot = split as Prisma.JsonObject;
  const feeBearer =
    typeof snapshot.feeBearer === 'string' ? snapshot.feeBearer : '';
  const sourceAccountId =
    typeof snapshot.sourceAccountId === 'string'
      ? snapshot.sourceAccountId.trim()
      : '';

  return feeBearer === 'HOTEL' && /^[a-f0-9]{24}$/i.test(sourceAccountId)
    ? sourceAccountId
    : null;
}

function getManualRefundRequiredMessage(paymentSourceType?: string | null) {
  const normalizedSource = normalizePaymentSourceType(paymentSourceType);

  if (!NON_REFUNDABLE_XENDIT_SOURCES.has(normalizedSource)) {
    return null;
  }

  return `${MANUAL_REFUND_REQUIRED_PREFIX} QR Ph payments cannot be refunded through the Xendit Refund API. The order is cancelled, but staff must settle the amount manually with the guest or contact Xendit Support.`;
}

function isManualRefundRequiredError(value?: string | null) {
  return String(value ?? '').startsWith(MANUAL_REFUND_REQUIRED_PREFIX);
}

export function isAutomaticGuestRefundEnabled() {
  return process.env.XENDIT_AUTO_REFUND_ON_FULFILLMENT_FAILURE !== 'false';
}

async function recalculateGuestRefundStateTx(
  tx: Prisma.TransactionClient,
  sessionId: string
) {
  const session = await tx.guestXenditSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      orderId: true,
      amountCents: true,
      paidAmountCents: true,
      status: true,
      serviceRequests: {
        select: {
          id: true,
          amountCents: true,
          paymentMethod: true,
        },
      },
      refunds: {
        select: {
          amountCents: true,
          status: true,
          xenditRefundId: true,
          processedAt: true,
          errorMessage: true,
          serviceRequestId: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  const succeededAmount = session.refunds
    .filter((refund) => refund.status === GuestXenditRefundStatus.SUCCEEDED)
    .reduce((sum, refund) => sum + refund.amountCents, 0);

  const pendingRefunds = session.refunds.filter(
    (refund) =>
      refund.status === GuestXenditRefundStatus.PENDING ||
      refund.status === GuestXenditRefundStatus.PROCESSING
  );

  const failedRefunds = session.refunds.filter(
    (refund) => refund.status === GuestXenditRefundStatus.FAILED
  );

  const paidAmount = session.paidAmountCents ?? session.amountCents;
  const fullyRefunded = paidAmount > 0 && succeededAmount >= paidAmount;
  const partiallyRefunded = succeededAmount > 0 && !fullyRefunded;
  const hasPending = pendingRefunds.length > 0;
  const hasFailed = failedRefunds.length > 0 && !hasPending;
  const manualReviewRefund = failedRefunds
    .filter((refund) => isManualRefundRequiredError(refund.errorMessage))
    .sort(
      (left, right) =>
        (right.processedAt?.getTime() ?? 0) -
        (left.processedAt?.getTime() ?? 0)
    )[0];

  let sessionStatus: GuestXenditStatus = session.status;
  let aggregateRefundStatus: GuestXenditRefundStatus =
    GuestXenditRefundStatus.NOT_REQUESTED;

  if (fullyRefunded) {
    sessionStatus = GuestXenditStatus.REFUNDED;
    aggregateRefundStatus = GuestXenditRefundStatus.SUCCEEDED;
  } else if (hasPending) {
    sessionStatus = GuestXenditStatus.REFUND_PENDING;
    aggregateRefundStatus = pendingRefunds.some(
      (refund) => refund.status === GuestXenditRefundStatus.PROCESSING
    )
      ? GuestXenditRefundStatus.PROCESSING
      : GuestXenditRefundStatus.PENDING;
  } else if (manualReviewRefund) {
    sessionStatus = GuestXenditStatus.PAID_REVIEW_REQUIRED;
    aggregateRefundStatus = GuestXenditRefundStatus.FAILED;
  } else if (hasFailed) {
    sessionStatus = GuestXenditStatus.REFUND_FAILED;
    aggregateRefundStatus = GuestXenditRefundStatus.FAILED;
  } else if (partiallyRefunded) {
    sessionStatus =
      session.orderId || session.serviceRequests.length > 0
        ? GuestXenditStatus.COMPLETED
        : GuestXenditStatus.PAID;
    aggregateRefundStatus = GuestXenditRefundStatus.SUCCEEDED;
  } else if (session.orderId || session.serviceRequests.length > 0) {
    sessionStatus = GuestXenditStatus.COMPLETED;
  }

  const latestRefund = [...session.refunds]
    .sort(
      (left, right) =>
        (right.processedAt?.getTime() ?? 0) -
        (left.processedAt?.getTime() ?? 0)
    )[0];

  await tx.guestXenditSession.update({
    where: { id: session.id },
    data: {
      status: sessionStatus,
      refundStatus: aggregateRefundStatus,
      refundedAmountCents: succeededAmount,
      refundAmountCents: succeededAmount || null,
      xenditRefundId:
        latestRefund?.xenditRefundId ?? undefined,
      refundedAt: fullyRefunded ? new Date() : null,
      refundErrorMessage: manualReviewRefund?.errorMessage
        ? manualReviewRefund.errorMessage
        : hasFailed
          ? failedRefunds
              .filter((refund) => Boolean(refund.errorMessage))
              .sort(
                (left, right) =>
                  (right.processedAt?.getTime() ?? 0) -
                  (left.processedAt?.getTime() ?? 0)
              )[0]?.errorMessage ||
            'One or more Xendit refunds failed and require retry.'
          : null,
    },
  });

  if (session.orderId) {
    let orderPaymentStatus: PaymentStatus = PaymentStatus.PAID;

    if (fullyRefunded) {
      orderPaymentStatus = PaymentStatus.REFUNDED;
    } else if (hasPending) {
      orderPaymentStatus = PaymentStatus.REFUND_PENDING;
    } else if (hasFailed) {
      orderPaymentStatus = PaymentStatus.REFUND_FAILED;
    } else if (partiallyRefunded) {
      orderPaymentStatus = PaymentStatus.PARTIALLY_REFUNDED;
    }

    await tx.order.updateMany({
      where: { id: session.orderId },
      data: { paymentStatus: orderPaymentStatus },
    });
  }

  for (const request of session.serviceRequests) {
    if (!request.paymentMethod || request.amountCents <= 0) {
      continue;
    }

    const requestRefunds = session.refunds.filter(
      (refund) => refund.serviceRequestId === request.id
    );
    const requestSucceeded = requestRefunds
      .filter((refund) => refund.status === GuestXenditRefundStatus.SUCCEEDED)
      .reduce((sum, refund) => sum + refund.amountCents, 0);
    const requestPending = requestRefunds.some(
      (refund) =>
        refund.status === GuestXenditRefundStatus.PENDING ||
        refund.status === GuestXenditRefundStatus.PROCESSING
    );
    const requestFailed =
      !requestPending &&
      requestRefunds.some(
        (refund) => refund.status === GuestXenditRefundStatus.FAILED
      );

    let requestPaymentStatus: PaymentStatus = PaymentStatus.PAID;

    if (requestSucceeded >= request.amountCents) {
      requestPaymentStatus = PaymentStatus.REFUNDED;
    } else if (requestPending) {
      requestPaymentStatus = PaymentStatus.REFUND_PENDING;
    } else if (requestFailed) {
      requestPaymentStatus = PaymentStatus.REFUND_FAILED;
    } else if (requestSucceeded > 0) {
      requestPaymentStatus = PaymentStatus.PARTIALLY_REFUNDED;
    }

    await tx.serviceRequest.updateMany({
      where: { id: request.id },
      data: { paymentStatus: requestPaymentStatus },
    });
  }

  return {
    paidAmount,
    succeededAmount,
    fullyRefunded,
    partiallyRefunded,
    hasPending,
    hasFailed,
  };
}

export async function refreshGuestRefundState(sessionId: string) {
  return db.$transaction((tx) => recalculateGuestRefundStateTx(tx, sessionId));
}


async function recordManualRefundRequired(input: {
  sessionId: string;
  orderId?: string | null;
  orderItemId?: string | null;
  serviceRequestId?: string | null;
  kind: GuestXenditRefundKind;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  reason: string;
  message: string;
}) {
  const refund = await db.$transaction(
    async (tx) => {
      const refundRecord = await tx.guestXenditRefund.upsert({
        where: { idempotencyKey: input.idempotencyKey },
        update: {
          status: GuestXenditRefundStatus.FAILED,
          amountCents: input.amountCents,
          reason: input.reason.slice(0, 191),
          notes: input.message.slice(0, 2000),
          errorMessage: input.message.slice(0, 2000),
          processedAt: new Date(),
        },
        create: {
          guestPaymentSessionId: input.sessionId,
          orderId: input.orderId ?? null,
          orderItemId: input.orderItemId ?? null,
          serviceRequestId: input.serviceRequestId ?? null,
          kind: input.kind,
          status: GuestXenditRefundStatus.FAILED,
          amountCents: input.amountCents,
          currency: input.currency,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason.slice(0, 191),
          notes: input.message.slice(0, 2000),
          errorMessage: input.message.slice(0, 2000),
          processedAt: new Date(),
        },
      });

      await recalculateGuestRefundStateTx(tx, input.sessionId);

      return refundRecord;
    },
    {
      maxWait: 10_000,
      timeout: 30_000,
    }
  );

  await safelyNotifyGuestRefund(refund.id);

  return refund;
}

export async function requestGuestXenditRefund(input: {
  sessionId: string;
  amountCents?: number;
  reason: string;
  kind?: GuestXenditRefundKind;
  orderId?: string | null;
  orderItemId?: string | null;
  serviceRequestId?: string | null;
  idempotencySuffix?: string;
  notes?: string;
}) {
  const session = await db.guestXenditSession.findFirst({
    where: { id: input.sessionId, paymentProvider: 'XENDIT' },
    include: {
      refunds: {
        select: {
          amountCents: true,
          status: true,
          idempotencyKey: true,
          xenditRefundId: true,
        },
      },
    },
  });

  if (!session) {
    return {
      ok: false as const,
      skipped: true as const,
      message: 'Guest Xendit session was not found.',
    };
  }

  if (!session.xenditPaymentRequestId) {
    const message =
      'Payment was received, but its Xendit payment request ID is missing. Manual review is required.';

    await db.guestXenditSession.update({
      where: { id: session.id },
      data: {
        status: GuestXenditStatus.PAID_REVIEW_REQUIRED,
        refundErrorMessage: message,
      },
    });

    await safelyNotifyGuestPayment(session.id);

    return {
      ok: false as const,
      skipped: true as const,
      message,
    };
  }

  const paidAmount = session.paidAmountCents ?? session.amountCents;
  const committedAmount = session.refunds
    .filter(
      (refund) =>
        refund.status === GuestXenditRefundStatus.PENDING ||
        refund.status === GuestXenditRefundStatus.PROCESSING ||
        refund.status === GuestXenditRefundStatus.SUCCEEDED
    )
    .reduce((sum, refund) => sum + refund.amountCents, 0);

  const remainingRefundable = Math.max(paidAmount - committedAmount, 0);
  const requestedAmount = input.amountCents ?? remainingRefundable;
  const amountCents = Math.min(Math.max(Math.round(requestedAmount), 0), remainingRefundable);

  if (amountCents <= 0) {
    await refreshGuestRefundState(session.id);

    return {
      ok: true as const,
      skipped: true as const,
      alreadyRefunded: true as const,
      message: 'No refundable Xendit balance remains.',
    };
  }

  const suffix =
    input.idempotencySuffix ||
    input.orderItemId ||
    input.serviceRequestId ||
    input.orderId ||
    createHash('sha256')
      .update(`${input.reason}:${amountCents}`)
      .digest('hex')
      .slice(0, 16);

  const idempotencyKey = safeIdempotencyKey(
    `cloudview-guest-refund-${session.id}-${suffix}`
  );

  const manualRefundMessage = getManualRefundRequiredMessage(
    session.paymentSourceType
  );

  if (manualRefundMessage) {
    const refundRecord = await recordManualRefundRequired({
      sessionId: session.id,
      orderId: input.orderId ?? session.orderId,
      orderItemId: input.orderItemId ?? null,
      serviceRequestId: input.serviceRequestId ?? null,
      kind: input.kind ?? GuestXenditRefundKind.FULL,
      amountCents,
      currency: session.currency,
      idempotencyKey,
      reason: input.reason,
      message: manualRefundMessage,
    });

    return {
      ok: false as const,
      skipped: true as const,
      manualRefundRequired: true as const,
      refundRecordId: refundRecord.id,
      message: manualRefundMessage,
      amountCents,
    };
  }

  const existing = await db.guestXenditRefund.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    await refreshGuestRefundState(session.id);

    return {
      ok: existing.status !== GuestXenditRefundStatus.FAILED,
      skipped: true as const,
      alreadyRefunded:
        existing.status === GuestXenditRefundStatus.SUCCEEDED,
      refundId: existing.xenditRefundId,
      status: existing.status,
      message: 'This refund request was already created.',
    };
  }

  const refundRecord = await db.$transaction(async (tx) => {
    const refund = await tx.guestXenditRefund.create({
      data: {
        guestPaymentSessionId: session.id,
        orderId: input.orderId ?? session.orderId,
        orderItemId: input.orderItemId ?? null,
        serviceRequestId: input.serviceRequestId ?? null,
        kind: input.kind ?? GuestXenditRefundKind.FULL,
        status: GuestXenditRefundStatus.PENDING,
        amountCents,
        currency: session.currency,
        idempotencyKey,
        reason: input.reason.slice(0, 191),
        notes: (input.notes || input.reason).slice(0, 2000),
      },
    });

    await tx.guestXenditSession.update({
      where: { id: session.id },
      data: {
        status: GuestXenditStatus.REFUND_PENDING,
        refundStatus: GuestXenditRefundStatus.PENDING,
        refundRequestedAt: new Date(),
        refundReason: input.reason.slice(0, 191),
        refundNotes: (input.notes || input.reason).slice(0, 2000),
        refundErrorMessage: null,
      },
    });

    if (refund.orderId) {
      await tx.order.updateMany({
        where: { id: refund.orderId },
        data: { paymentStatus: PaymentStatus.REFUND_PENDING },
      });
    }

    if (refund.serviceRequestId) {
      await tx.serviceRequest.updateMany({
        where: { id: refund.serviceRequestId },
        data: { paymentStatus: PaymentStatus.REFUND_PENDING },
      });
    }

    return refund;
  });

  await safelyNotifyGuestRefund(refundRecord.id);

  try {
    const refund = await createXenditRefund({
      idempotencyKey,
      paymentRequestId: session.xenditPaymentRequestId,
      amount: amountCents,
      reason: 'OTHERS',
      notes: `CloudView ${input.kind ?? GuestXenditRefundKind.FULL} refund: ${input.reason}`,
      forUserId: getRefundForUserId(session.payload),
      metadata: {
        guest_payment_session_id: session.id,
        guest_refund_id: refundRecord.id,
        flow_type: session.flowType,
        hotel_id: session.hotelId,
        ...(refundRecord.orderId ? { order_id: refundRecord.orderId } : {}),
        ...(refundRecord.orderItemId
          ? { order_item_id: refundRecord.orderItemId }
          : {}),
        ...(refundRecord.serviceRequestId
          ? { service_request_id: refundRecord.serviceRequestId }
          : {}),
      },
    });

    const mappedStatus = mapXenditRefundStatus(refund.status);

    await db.$transaction(async (tx) => {
      await tx.guestXenditRefund.update({
        where: { id: refundRecord.id },
        data: {
          xenditRefundId: refund.id,
          status: mappedStatus,
          processedAt:
            mappedStatus === GuestXenditRefundStatus.SUCCEEDED ||
            mappedStatus === GuestXenditRefundStatus.FAILED
              ? new Date()
              : null,
          errorMessage:
            mappedStatus === GuestXenditRefundStatus.FAILED
              ? 'Xendit reported that the refund failed.'
              : null,
        },
      });

      await recalculateGuestRefundStateTx(tx, session.id);
    });

    await safelyNotifyGuestRefund(refundRecord.id);

    return {
      ok: mappedStatus !== GuestXenditRefundStatus.FAILED,
      skipped: false as const,
      refundId: refund.id,
      status: mappedStatus,
      amountCents,
    };
  } catch (error) {
    const message = errorMessage(
      error,
      'Unable to create the Xendit refund.'
    );

    await db.$transaction(async (tx) => {
      await tx.guestXenditRefund.update({
        where: { id: refundRecord.id },
        data: {
          status: GuestXenditRefundStatus.FAILED,
          errorMessage: message.slice(0, 2000),
          processedAt: new Date(),
        },
      });

      await recalculateGuestRefundStateTx(tx, session.id);
    });

    await safelyNotifyGuestRefund(refundRecord.id);

    console.error('[Guest Xendit] Refund request failed.', {
      sessionId: session.id,
      refundRecordId: refundRecord.id,
      paymentRequestId: session.xenditPaymentRequestId,
      amountCents,
      message,
    });

    return {
      ok: false as const,
      skipped: false as const,
      message,
      amountCents,
    };
  }
}

export async function requestAutomaticGuestRefund(input: {
  sessionId: string;
  reason: string;
}) {
  if (!isAutomaticGuestRefundEnabled()) {
    return {
      ok: false as const,
      skipped: true as const,
      message: 'Automatic Xendit refunds are disabled.',
    };
  }

  return requestGuestXenditRefund({
    sessionId: input.sessionId,
    reason: input.reason,
    kind: GuestXenditRefundKind.FULL,
    idempotencySuffix: 'automatic-full-refund',
  });
}

export async function requestGuestFoodOrderRefund(input: {
  orderId: string;
  amountCents?: number;
  reason: string;
  orderItemId?: string | null;
  idempotencySuffix?: string;
}) {
  const session = await db.guestXenditSession.findFirst({
    where: {
      orderId: input.orderId,
      flowType: GuestXenditFlow.FOOD_ORDER,
      paymentProvider: 'XENDIT',
      xenditPaymentId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (!session) {
    return {
      ok: false as const,
      skipped: true as const,
      message: 'This order is not linked to a paid Guest Xendit session.',
    };
  }

  return requestGuestXenditRefund({
    sessionId: session.id,
    amountCents: input.amountCents,
    reason: input.reason,
    kind: input.orderItemId
      ? GuestXenditRefundKind.PARTIAL
      : GuestXenditRefundKind.FULL,
    orderId: input.orderId,
    orderItemId: input.orderItemId,
    idempotencySuffix:
      input.idempotencySuffix ||
      (input.orderItemId
        ? `item-${input.orderItemId}`
        : `order-${input.orderId}`),
  });
}

export async function requestGuestServiceRequestRefund(input: {
  serviceRequestId: string;
  amountCents?: number;
  reason: string;
  kind?: GuestXenditRefundKind;
  idempotencySuffix?: string;
}) {
  const request = await db.serviceRequest.findUnique({
    where: { id: input.serviceRequestId },
    select: {
      id: true,
      amountCents: true,
      guestXenditSessionId: true,
      paymentMethod: true,
    },
  });

  if (
    !request?.guestXenditSessionId ||
    request.paymentMethod !== PaymentMethod.XENDIT
  ) {
    return {
      ok: false as const,
      skipped: true as const,
      message: 'This service request is not linked to a paid Guest Xendit session.',
    };
  }

  return requestGuestXenditRefund({
    sessionId: request.guestXenditSessionId,
    amountCents: input.amountCents ?? request.amountCents,
    reason: input.reason,
    kind: input.kind ?? GuestXenditRefundKind.PARTIAL,
    serviceRequestId: request.id,
    idempotencySuffix:
      input.idempotencySuffix || `service-request-${request.id}`,
  });
}

export async function markGuestPaymentFinalizationFailedAndRefund(input: {
  sessionId: string;
  error: unknown;
}) {
  const message = errorMessage(
    input.error,
    'The payment succeeded, but CloudView could not complete the guest transaction.'
  );

  await db.guestXenditSession.updateMany({
    where: {
      id: input.sessionId,
      status: {
        in: [
          GuestXenditStatus.PAID,
          GuestXenditStatus.PROCESSING,
          GuestXenditStatus.PAID_REVIEW_REQUIRED,
        ],
      },
    },
    data: {
      status: GuestXenditStatus.PAID_REVIEW_REQUIRED,
      errorMessage: message.slice(0, 2000),
    },
  });

  await safelyNotifyGuestPayment(input.sessionId);

  return requestAutomaticGuestRefund({
    sessionId: input.sessionId,
    reason: message,
  });
}

export async function applyGuestRefundWebhookUpdateTx(
  tx: Prisma.TransactionClient,
  input: {
    refundId?: string | null;
    paymentId?: string | null;
    amountCents?: number | null;
    status?: string | null;
  }
) {
  const mappedStatus = mapXenditRefundStatus(input.status || 'pending');

  let refund = input.refundId
    ? await tx.guestXenditRefund.findUnique({
        where: { xenditRefundId: input.refundId },
      })
    : null;

  if (!refund && input.paymentId) {
    const session = await tx.guestXenditSession.findFirst({
      where: { xenditPaymentId: input.paymentId },
      orderBy: { createdAt: 'desc' },
    });

    if (session && input.refundId && input.amountCents && input.amountCents > 0) {
      const idempotencyKey = safeIdempotencyKey(
        `cloudview-webhook-refund-${input.refundId}`
      );

      refund = await tx.guestXenditRefund.upsert({
        where: { idempotencyKey },
        update: {
          xenditRefundId: input.refundId,
          status: mappedStatus,
          processedAt:
            mappedStatus === GuestXenditRefundStatus.SUCCEEDED ||
            mappedStatus === GuestXenditRefundStatus.FAILED
              ? new Date()
              : null,
        },
        create: {
          guestPaymentSessionId: session.id,
          orderId: session.orderId,
          kind:
            input.amountCents >=
            (session.paidAmountCents ?? session.amountCents)
              ? GuestXenditRefundKind.FULL
              : GuestXenditRefundKind.PARTIAL,
          status: mappedStatus,
          amountCents: input.amountCents,
          currency: session.currency,
          idempotencyKey,
          xenditRefundId: input.refundId,
          reason: 'Refund received from Xendit webhook',
          notes: 'Refund record reconstructed from Xendit webhook.',
          processedAt:
            mappedStatus === GuestXenditRefundStatus.SUCCEEDED ||
            mappedStatus === GuestXenditRefundStatus.FAILED
              ? new Date()
              : null,
        },
      });
    }
  }

  if (!refund) {
    return null;
  }

  const updated = await tx.guestXenditRefund.update({
    where: { id: refund.id },
    data: {
      xenditRefundId: input.refundId ?? refund.xenditRefundId,
      amountCents:
        typeof input.amountCents === 'number' && input.amountCents > 0
          ? input.amountCents
          : refund.amountCents,
      status: mappedStatus,
      processedAt:
        mappedStatus === GuestXenditRefundStatus.SUCCEEDED ||
        mappedStatus === GuestXenditRefundStatus.FAILED
          ? new Date()
          : null,
      errorMessage:
        mappedStatus === GuestXenditRefundStatus.FAILED
          ? 'Xendit reported that the refund failed.'
          : null,
    },
  });

  await recalculateGuestRefundStateTx(tx, updated.guestPaymentSessionId);

  return updated;
}

export async function applyGuestRefundWebhookUpdate(input: {
  refundId?: string | null;
  paymentId?: string | null;
  amountCents?: number | null;
  status?: string | null;
}) {
  const updated = await db.$transaction((tx) =>
    applyGuestRefundWebhookUpdateTx(tx, input)
  );

  if (updated) {
    await safelyNotifyGuestRefund(updated.id);
  }

  return updated;
}

export async function retryGuestXenditRefund(refundRecordId: string) {
  const refundRecord = await db.guestXenditRefund.findUnique({
    where: { id: refundRecordId },
    include: { guestPaymentSession: true },
  });

  if (!refundRecord) {
    return {
      ok: false as const,
      skipped: true as const,
      message: 'Refund record was not found.',
    };
  }

  if (refundRecord.status === GuestXenditRefundStatus.SUCCEEDED) {
    return {
      ok: true as const,
      skipped: true as const,
      alreadyRefunded: true as const,
      refundId: refundRecord.xenditRefundId,
    };
  }

  if (
    refundRecord.status === GuestXenditRefundStatus.PENDING ||
    refundRecord.status === GuestXenditRefundStatus.PROCESSING
  ) {
    return {
      ok: true as const,
      skipped: true as const,
      message: 'Refund is already being processed.',
      refundId: refundRecord.xenditRefundId,
    };
  }

  const session = refundRecord.guestPaymentSession;

  if (!session.xenditPaymentRequestId) {
    return {
      ok: false as const,
      skipped: true as const,
      message: 'Xendit payment request ID is missing.',
    };
  }

  const manualRefundMessage = getManualRefundRequiredMessage(
    session.paymentSourceType
  );

  if (manualRefundMessage) {
    await db.$transaction(
      async (tx) => {
        await tx.guestXenditRefund.update({
          where: { id: refundRecord.id },
          data: {
            status: GuestXenditRefundStatus.FAILED,
            errorMessage: manualRefundMessage.slice(0, 2000),
            processedAt: new Date(),
          },
        });

        await recalculateGuestRefundStateTx(tx, session.id);
      },
      {
        maxWait: 10_000,
        timeout: 30_000,
      }
    );

    await safelyNotifyGuestRefund(refundRecord.id);

    return {
      ok: false as const,
      skipped: true as const,
      manualRefundRequired: true as const,
      message: manualRefundMessage,
    };
  }

  await db.guestXenditRefund.update({
    where: { id: refundRecord.id },
    data: {
      status: GuestXenditRefundStatus.PENDING,
      errorMessage: null,
      processedAt: null,
    },
  });

  await safelyNotifyGuestRefund(refundRecord.id);

  try {
    const refund = await createXenditRefund({
      idempotencyKey: refundRecord.idempotencyKey,
      paymentRequestId: session.xenditPaymentRequestId,
      amount: refundRecord.amountCents,
      reason: 'OTHERS',
      notes: refundRecord.notes || refundRecord.reason,
      forUserId: getRefundForUserId(session.payload),
      metadata: {
        guest_payment_session_id: session.id,
        guest_refund_id: refundRecord.id,
        flow_type: session.flowType,
        hotel_id: session.hotelId,
        ...(refundRecord.orderId
          ? { order_id: refundRecord.orderId }
          : {}),
        ...(refundRecord.orderItemId
          ? { order_item_id: refundRecord.orderItemId }
          : {}),
        ...(refundRecord.serviceRequestId
          ? { service_request_id: refundRecord.serviceRequestId }
          : {}),
      },
    });

    const mappedStatus = mapXenditRefundStatus(refund.status);

    await db.$transaction(async (tx) => {
      await tx.guestXenditRefund.update({
        where: { id: refundRecord.id },
        data: {
          xenditRefundId: refund.id,
          status: mappedStatus,
          processedAt:
            mappedStatus === GuestXenditRefundStatus.SUCCEEDED ||
            mappedStatus === GuestXenditRefundStatus.FAILED
              ? new Date()
              : null,
          errorMessage:
            mappedStatus === GuestXenditRefundStatus.FAILED
              ? 'Xendit reported that the retried refund failed.'
              : null,
        },
      });

      await recalculateGuestRefundStateTx(tx, session.id);
    });

    await safelyNotifyGuestRefund(refundRecord.id);

    return {
      ok: mappedStatus !== GuestXenditRefundStatus.FAILED,
      skipped: false as const,
      refundId: refund.id,
      status: mappedStatus,
    };
  } catch (error) {
    const message = errorMessage(error, 'Unable to retry the Xendit refund.');

    await db.$transaction(async (tx) => {
      await tx.guestXenditRefund.update({
        where: { id: refundRecord.id },
        data: {
          status: GuestXenditRefundStatus.FAILED,
          errorMessage: message.slice(0, 2000),
          processedAt: new Date(),
        },
      });

      await recalculateGuestRefundStateTx(tx, session.id);
    });

    await safelyNotifyGuestRefund(refundRecord.id);

    return {
      ok: false as const,
      skipped: false as const,
      message,
    };
  }
}
