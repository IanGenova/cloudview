import 'server-only';

import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import {
  GuestPayMongoFlow,
  GuestPayMongoRefundKind,
  GuestPayMongoRefundStatus,
  GuestPayMongoStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { createPayMongoRefund } from '@/lib/paymongo';
import {
  notifyGuestPayMongoRefundStatus,
  notifyGuestPayMongoStatus,
} from '@/lib/paymongo-dashboard-notifications';


async function safelyNotifyGuestPayment(sessionId: string) {
  try {
    await notifyGuestPayMongoStatus({ sessionId });
  } catch (error) {
    console.warn('[Guest PayMongo] Unable to create payment notification.', {
      sessionId,
      error,
    });
  }
}

async function safelyNotifyGuestRefund(refundId: string) {
  try {
    await notifyGuestPayMongoRefundStatus({ refundId });
  } catch (error) {
    console.warn('[Guest PayMongo] Unable to create refund notification.', {
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

function mapPayMongoRefundStatus(value: string): GuestPayMongoRefundStatus {
  if (value === 'succeeded') {
    return GuestPayMongoRefundStatus.SUCCEEDED;
  }

  if (value === 'failed') {
    return GuestPayMongoRefundStatus.FAILED;
  }

  if (value === 'processing') {
    return GuestPayMongoRefundStatus.PROCESSING;
  }

  return GuestPayMongoRefundStatus.PENDING;
}

function safeIdempotencyKey(input: string) {
  const compact = input.replace(/[^a-zA-Z0-9_-]/g, '-');

  if (compact.length <= 180) {
    return compact;
  }

  const digest = createHash('sha256').update(compact).digest('hex').slice(0, 24);
  return `${compact.slice(0, 150)}-${digest}`;
}

export function isAutomaticGuestRefundEnabled() {
  return process.env.PAYMONGO_AUTO_REFUND_ON_FULFILLMENT_FAILURE !== 'false';
}

async function recalculateGuestRefundStateTx(
  tx: Prisma.TransactionClient,
  sessionId: string
) {
  const session = await tx.guestPayMongoSession.findUnique({
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
          paymongoRefundId: true,
          processedAt: true,
          serviceRequestId: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  const succeededAmount = session.refunds
    .filter((refund) => refund.status === GuestPayMongoRefundStatus.SUCCEEDED)
    .reduce((sum, refund) => sum + refund.amountCents, 0);

  const pendingRefunds = session.refunds.filter(
    (refund) =>
      refund.status === GuestPayMongoRefundStatus.PENDING ||
      refund.status === GuestPayMongoRefundStatus.PROCESSING
  );

  const failedRefunds = session.refunds.filter(
    (refund) => refund.status === GuestPayMongoRefundStatus.FAILED
  );

  const paidAmount = session.paidAmountCents ?? session.amountCents;
  const fullyRefunded = paidAmount > 0 && succeededAmount >= paidAmount;
  const partiallyRefunded = succeededAmount > 0 && !fullyRefunded;
  const hasPending = pendingRefunds.length > 0;
  const hasFailed = failedRefunds.length > 0 && !hasPending;

  let sessionStatus: GuestPayMongoStatus = session.status;
  let aggregateRefundStatus: GuestPayMongoRefundStatus =
    GuestPayMongoRefundStatus.NOT_REQUESTED;

  if (fullyRefunded) {
    sessionStatus = GuestPayMongoStatus.REFUNDED;
    aggregateRefundStatus = GuestPayMongoRefundStatus.SUCCEEDED;
  } else if (hasPending) {
    sessionStatus = GuestPayMongoStatus.REFUND_PENDING;
    aggregateRefundStatus = pendingRefunds.some(
      (refund) => refund.status === GuestPayMongoRefundStatus.PROCESSING
    )
      ? GuestPayMongoRefundStatus.PROCESSING
      : GuestPayMongoRefundStatus.PENDING;
  } else if (hasFailed) {
    sessionStatus = GuestPayMongoStatus.REFUND_FAILED;
    aggregateRefundStatus = GuestPayMongoRefundStatus.FAILED;
  } else if (partiallyRefunded) {
    sessionStatus =
      session.orderId || session.serviceRequests.length > 0
        ? GuestPayMongoStatus.COMPLETED
        : GuestPayMongoStatus.PAID;
    aggregateRefundStatus = GuestPayMongoRefundStatus.SUCCEEDED;
  } else if (session.orderId || session.serviceRequests.length > 0) {
    sessionStatus = GuestPayMongoStatus.COMPLETED;
  }

  const latestRefund = [...session.refunds]
    .sort(
      (left, right) =>
        (right.processedAt?.getTime() ?? 0) -
        (left.processedAt?.getTime() ?? 0)
    )[0];

  await tx.guestPayMongoSession.update({
    where: { id: session.id },
    data: {
      status: sessionStatus,
      refundStatus: aggregateRefundStatus,
      refundedAmountCents: succeededAmount,
      refundAmountCents: succeededAmount || null,
      paymongoRefundId:
        latestRefund?.paymongoRefundId ?? undefined,
      refundedAt: fullyRefunded ? new Date() : null,
      refundErrorMessage: hasFailed
        ? 'One or more PayMongo refunds failed and require retry.'
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
      .filter((refund) => refund.status === GuestPayMongoRefundStatus.SUCCEEDED)
      .reduce((sum, refund) => sum + refund.amountCents, 0);
    const requestPending = requestRefunds.some(
      (refund) =>
        refund.status === GuestPayMongoRefundStatus.PENDING ||
        refund.status === GuestPayMongoRefundStatus.PROCESSING
    );
    const requestFailed =
      !requestPending &&
      requestRefunds.some(
        (refund) => refund.status === GuestPayMongoRefundStatus.FAILED
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

export async function requestGuestPayMongoRefund(input: {
  sessionId: string;
  amountCents?: number;
  reason: string;
  kind?: GuestPayMongoRefundKind;
  orderId?: string | null;
  orderItemId?: string | null;
  serviceRequestId?: string | null;
  idempotencySuffix?: string;
  notes?: string;
}) {
  const session = await db.guestPayMongoSession.findUnique({
    where: { id: input.sessionId },
    include: {
      refunds: {
        select: {
          amountCents: true,
          status: true,
          idempotencyKey: true,
          paymongoRefundId: true,
        },
      },
    },
  });

  if (!session) {
    return {
      ok: false as const,
      skipped: true as const,
      message: 'Guest PayMongo session was not found.',
    };
  }

  if (!session.paymongoPaymentId) {
    const message =
      'Payment was received, but its PayMongo payment ID is missing. Manual review is required.';

    await db.guestPayMongoSession.update({
      where: { id: session.id },
      data: {
        status: GuestPayMongoStatus.PAID_REVIEW_REQUIRED,
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
        refund.status === GuestPayMongoRefundStatus.PENDING ||
        refund.status === GuestPayMongoRefundStatus.PROCESSING ||
        refund.status === GuestPayMongoRefundStatus.SUCCEEDED
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
      message: 'No refundable PayMongo balance remains.',
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

  const existing = await db.guestPayMongoRefund.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    await refreshGuestRefundState(session.id);

    return {
      ok: existing.status !== GuestPayMongoRefundStatus.FAILED,
      skipped: true as const,
      alreadyRefunded:
        existing.status === GuestPayMongoRefundStatus.SUCCEEDED,
      refundId: existing.paymongoRefundId,
      status: existing.status,
      message: 'This refund request was already created.',
    };
  }

  const refundRecord = await db.$transaction(async (tx) => {
    const refund = await tx.guestPayMongoRefund.create({
      data: {
        guestPaymentSessionId: session.id,
        orderId: input.orderId ?? session.orderId,
        orderItemId: input.orderItemId ?? null,
        serviceRequestId: input.serviceRequestId ?? null,
        kind: input.kind ?? GuestPayMongoRefundKind.FULL,
        status: GuestPayMongoRefundStatus.PENDING,
        amountCents,
        currency: session.currency,
        idempotencyKey,
        reason: input.reason.slice(0, 191),
        notes: (input.notes || input.reason).slice(0, 2000),
      },
    });

    await tx.guestPayMongoSession.update({
      where: { id: session.id },
      data: {
        status: GuestPayMongoStatus.REFUND_PENDING,
        refundStatus: GuestPayMongoRefundStatus.PENDING,
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
    const refund = await createPayMongoRefund({
      idempotencyKey,
      paymentId: session.paymongoPaymentId,
      amount: amountCents,
      reason: 'requested_by_customer',
      notes: `CloudView ${input.kind ?? GuestPayMongoRefundKind.FULL} refund: ${input.reason}`,
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

    const mappedStatus = mapPayMongoRefundStatus(refund.status);

    await db.$transaction(async (tx) => {
      await tx.guestPayMongoRefund.update({
        where: { id: refundRecord.id },
        data: {
          paymongoRefundId: refund.id,
          status: mappedStatus,
          processedAt:
            mappedStatus === GuestPayMongoRefundStatus.SUCCEEDED ||
            mappedStatus === GuestPayMongoRefundStatus.FAILED
              ? new Date()
              : null,
          errorMessage:
            mappedStatus === GuestPayMongoRefundStatus.FAILED
              ? 'PayMongo reported that the refund failed.'
              : null,
        },
      });

      await recalculateGuestRefundStateTx(tx, session.id);
    });

    await safelyNotifyGuestRefund(refundRecord.id);

    return {
      ok: mappedStatus !== GuestPayMongoRefundStatus.FAILED,
      skipped: false as const,
      refundId: refund.id,
      status: mappedStatus,
      amountCents,
    };
  } catch (error) {
    const message = errorMessage(
      error,
      'Unable to create the PayMongo refund.'
    );

    await db.$transaction(async (tx) => {
      await tx.guestPayMongoRefund.update({
        where: { id: refundRecord.id },
        data: {
          status: GuestPayMongoRefundStatus.FAILED,
          errorMessage: message.slice(0, 2000),
          processedAt: new Date(),
        },
      });

      await recalculateGuestRefundStateTx(tx, session.id);
    });

    await safelyNotifyGuestRefund(refundRecord.id);

    console.error('[Guest PayMongo] Refund request failed.', {
      sessionId: session.id,
      refundRecordId: refundRecord.id,
      paymentId: session.paymongoPaymentId,
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
      message: 'Automatic PayMongo refunds are disabled.',
    };
  }

  return requestGuestPayMongoRefund({
    sessionId: input.sessionId,
    reason: input.reason,
    kind: GuestPayMongoRefundKind.FULL,
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
  const session = await db.guestPayMongoSession.findFirst({
    where: {
      orderId: input.orderId,
      flowType: GuestPayMongoFlow.FOOD_ORDER,
      paymongoPaymentId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  if (!session) {
    return {
      ok: false as const,
      skipped: true as const,
      message: 'This order is not linked to a paid Guest PayMongo session.',
    };
  }

  return requestGuestPayMongoRefund({
    sessionId: session.id,
    amountCents: input.amountCents,
    reason: input.reason,
    kind: input.orderItemId
      ? GuestPayMongoRefundKind.PARTIAL
      : GuestPayMongoRefundKind.FULL,
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
  kind?: GuestPayMongoRefundKind;
  idempotencySuffix?: string;
}) {
  const request = await db.serviceRequest.findUnique({
    where: { id: input.serviceRequestId },
    select: {
      id: true,
      amountCents: true,
      guestPayMongoSessionId: true,
      paymentMethod: true,
    },
  });

  if (
    !request?.guestPayMongoSessionId ||
    request.paymentMethod !== PaymentMethod.PAYMONGO
  ) {
    return {
      ok: false as const,
      skipped: true as const,
      message: 'This service request is not linked to a paid Guest PayMongo session.',
    };
  }

  return requestGuestPayMongoRefund({
    sessionId: request.guestPayMongoSessionId,
    amountCents: input.amountCents ?? request.amountCents,
    reason: input.reason,
    kind: input.kind ?? GuestPayMongoRefundKind.PARTIAL,
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

  await db.guestPayMongoSession.updateMany({
    where: {
      id: input.sessionId,
      status: {
        in: [
          GuestPayMongoStatus.PAID,
          GuestPayMongoStatus.PROCESSING,
          GuestPayMongoStatus.PAID_REVIEW_REQUIRED,
        ],
      },
    },
    data: {
      status: GuestPayMongoStatus.PAID_REVIEW_REQUIRED,
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
  const mappedStatus = mapPayMongoRefundStatus(input.status || 'pending');

  let refund = input.refundId
    ? await tx.guestPayMongoRefund.findUnique({
        where: { paymongoRefundId: input.refundId },
      })
    : null;

  if (!refund && input.paymentId) {
    const session = await tx.guestPayMongoSession.findFirst({
      where: { paymongoPaymentId: input.paymentId },
      orderBy: { createdAt: 'desc' },
    });

    if (session && input.refundId && input.amountCents && input.amountCents > 0) {
      const idempotencyKey = safeIdempotencyKey(
        `cloudview-webhook-refund-${input.refundId}`
      );

      refund = await tx.guestPayMongoRefund.upsert({
        where: { idempotencyKey },
        update: {
          paymongoRefundId: input.refundId,
          status: mappedStatus,
          processedAt:
            mappedStatus === GuestPayMongoRefundStatus.SUCCEEDED ||
            mappedStatus === GuestPayMongoRefundStatus.FAILED
              ? new Date()
              : null,
        },
        create: {
          guestPaymentSessionId: session.id,
          orderId: session.orderId,
          kind:
            input.amountCents >=
            (session.paidAmountCents ?? session.amountCents)
              ? GuestPayMongoRefundKind.FULL
              : GuestPayMongoRefundKind.PARTIAL,
          status: mappedStatus,
          amountCents: input.amountCents,
          currency: session.currency,
          idempotencyKey,
          paymongoRefundId: input.refundId,
          reason: 'Refund received from PayMongo webhook',
          notes: 'Refund record reconstructed from PayMongo webhook.',
          processedAt:
            mappedStatus === GuestPayMongoRefundStatus.SUCCEEDED ||
            mappedStatus === GuestPayMongoRefundStatus.FAILED
              ? new Date()
              : null,
        },
      });
    }
  }

  if (!refund) {
    return null;
  }

  const updated = await tx.guestPayMongoRefund.update({
    where: { id: refund.id },
    data: {
      paymongoRefundId: input.refundId ?? refund.paymongoRefundId,
      amountCents:
        typeof input.amountCents === 'number' && input.amountCents > 0
          ? input.amountCents
          : refund.amountCents,
      status: mappedStatus,
      processedAt:
        mappedStatus === GuestPayMongoRefundStatus.SUCCEEDED ||
        mappedStatus === GuestPayMongoRefundStatus.FAILED
          ? new Date()
          : null,
      errorMessage:
        mappedStatus === GuestPayMongoRefundStatus.FAILED
          ? 'PayMongo reported that the refund failed.'
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

export async function retryGuestPayMongoRefund(refundRecordId: string) {
  const refundRecord = await db.guestPayMongoRefund.findUnique({
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

  if (refundRecord.status === GuestPayMongoRefundStatus.SUCCEEDED) {
    return {
      ok: true as const,
      skipped: true as const,
      alreadyRefunded: true as const,
      refundId: refundRecord.paymongoRefundId,
    };
  }

  if (
    refundRecord.status === GuestPayMongoRefundStatus.PENDING ||
    refundRecord.status === GuestPayMongoRefundStatus.PROCESSING
  ) {
    return {
      ok: true as const,
      skipped: true as const,
      message: 'Refund is already being processed.',
      refundId: refundRecord.paymongoRefundId,
    };
  }

  const session = refundRecord.guestPaymentSession;

  if (!session.paymongoPaymentId) {
    return {
      ok: false as const,
      skipped: true as const,
      message: 'PayMongo payment ID is missing.',
    };
  }

  await db.guestPayMongoRefund.update({
    where: { id: refundRecord.id },
    data: {
      status: GuestPayMongoRefundStatus.PENDING,
      errorMessage: null,
      processedAt: null,
    },
  });

  await safelyNotifyGuestRefund(refundRecord.id);

  try {
    const refund = await createPayMongoRefund({
      idempotencyKey: refundRecord.idempotencyKey,
      paymentId: session.paymongoPaymentId,
      amount: refundRecord.amountCents,
      reason: 'requested_by_customer',
      notes: refundRecord.notes || refundRecord.reason,
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

    const mappedStatus = mapPayMongoRefundStatus(refund.status);

    await db.$transaction(async (tx) => {
      await tx.guestPayMongoRefund.update({
        where: { id: refundRecord.id },
        data: {
          paymongoRefundId: refund.id,
          status: mappedStatus,
          processedAt:
            mappedStatus === GuestPayMongoRefundStatus.SUCCEEDED ||
            mappedStatus === GuestPayMongoRefundStatus.FAILED
              ? new Date()
              : null,
          errorMessage:
            mappedStatus === GuestPayMongoRefundStatus.FAILED
              ? 'PayMongo reported that the retried refund failed.'
              : null,
        },
      });

      await recalculateGuestRefundStateTx(tx, session.id);
    });

    await safelyNotifyGuestRefund(refundRecord.id);

    return {
      ok: mappedStatus !== GuestPayMongoRefundStatus.FAILED,
      skipped: false as const,
      refundId: refund.id,
      status: mappedStatus,
    };
  } catch (error) {
    const message = errorMessage(error, 'Unable to retry the PayMongo refund.');

    await db.$transaction(async (tx) => {
      await tx.guestPayMongoRefund.update({
        where: { id: refundRecord.id },
        data: {
          status: GuestPayMongoRefundStatus.FAILED,
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
