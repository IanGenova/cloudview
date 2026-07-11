import 'server-only';

import type { Prisma } from '@prisma/client';
import {
  GuestPayMongoFlow,
  GuestPayMongoRefundStatus,
  GuestPayMongoStatus,
  POSPayMongoStatus,
} from '@prisma/client';
import { db } from '@/lib/db';

const DEDUPE_WINDOW_MS = 12 * 60 * 60 * 1000;

type NotificationInput = {
  hotelId: string;
  type: string;
  title: string;
  message: string;
  url: string;
  payload: Record<string, Prisma.JsonValue>;
};

function money(cents?: number | null) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(Math.max(0, Number(cents ?? 0)) / 100);
}

function jsonStringArray(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
}

function guestFlowLabel(flowType: GuestPayMongoFlow) {
  return flowType === GuestPayMongoFlow.FOOD_ORDER
    ? 'food order'
    : 'service request';
}

function guestFlowUrl(flowType: GuestPayMongoFlow) {
  return flowType === GuestPayMongoFlow.FOOD_ORDER
    ? '/dashboard/orders'
    : '/dashboard/service-requests';
}

async function createUniqueNotification(input: NotificationInput) {
  const dedupeKey = String(input.payload.dedupeKey ?? '').trim();
  const createdAfter = new Date(Date.now() - DEDUPE_WINDOW_MS);

  const existing = await db.dashboardNotification.findFirst({
    where: {
      hotelId: input.hotelId,
      type: input.type,
      title: input.title,
      message: input.message,
      createdAt: {
        gte: createdAfter,
      },
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return existing;
  }

  return db.dashboardNotification.create({
    data: {
      hotelId: input.hotelId,
      type: input.type,
      title: input.title,
      message: input.message,
      url: input.url,
      payload: {
        ...input.payload,
        source: 'PAYMONGO',
        ...(dedupeKey ? { dedupeKey } : {}),
      } as Prisma.InputJsonValue,
    },
    select: {
      id: true,
    },
  });
}

function guestReference(input: {
  orderCode?: string | null;
  serviceRequestCodes?: Prisma.JsonValue | null;
  sessionId: string;
}) {
  if (input.orderCode) {
    return input.orderCode;
  }

  const requestCodes = jsonStringArray(input.serviceRequestCodes);

  if (requestCodes.length) {
    return requestCodes.join(', ');
  }

  return `payment ${input.sessionId.slice(-8).toUpperCase()}`;
}

export async function notifyGuestPayMongoStatus(input: {
  sessionId: string;
  eventId?: string | null;
}) {
  const session = await db.guestPayMongoSession.findUnique({
    where: {
      id: input.sessionId,
    },
    select: {
      id: true,
      hotelId: true,
      flowType: true,
      status: true,
      amountCents: true,
      paidAmountCents: true,
      refundedAmountCents: true,
      orderCode: true,
      serviceRequestCodes: true,
      checkoutSessionId: true,
      paymongoPaymentId: true,
      errorMessage: true,
      refundErrorMessage: true,
    },
  });

  if (!session || session.status === GuestPayMongoStatus.PENDING) {
    return null;
  }

  const reference = guestReference({
    orderCode: session.orderCode,
    serviceRequestCodes: session.serviceRequestCodes,
    sessionId: session.id,
  });
  const flowLabel = guestFlowLabel(session.flowType);
  const amount = money(session.paidAmountCents ?? session.amountCents);
  const url = guestFlowUrl(session.flowType);
  const basePayload = {
    dedupeKey: `guest:${session.id}:${session.status}:${input.eventId ?? ''}`,
    guestPayMongoSessionId: session.id,
    checkoutSessionId: session.checkoutSessionId ?? '',
    paymongoPaymentId: session.paymongoPaymentId ?? '',
    flowType: session.flowType,
    status: session.status,
    reference,
    amountCents: session.amountCents,
    paidAmountCents: session.paidAmountCents ?? session.amountCents,
    refundedAmountCents: session.refundedAmountCents,
    eventId: input.eventId ?? '',
  } satisfies Record<string, Prisma.JsonValue>;

  if (session.status === GuestPayMongoStatus.PAID) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_PAYMENT_PAID',
      title: 'PayMongo Payment Confirmed',
      message: `${amount} was confirmed for ${flowLabel} ${reference}. CloudView is finalizing the transaction.`,
      url,
      payload: basePayload,
    });
  }

  if (session.status === GuestPayMongoStatus.COMPLETED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_FULFILLMENT_COMPLETED',
      title: 'PayMongo Transaction Completed',
      message: `${flowLabel.charAt(0).toUpperCase()}${flowLabel.slice(1)} ${reference} was created successfully after PayMongo confirmation.`,
      url,
      payload: basePayload,
    });
  }

  if (session.status === GuestPayMongoStatus.CANCELLED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_CHECKOUT_CANCELLED',
      title: 'PayMongo Checkout Cancelled',
      message: `The guest cancelled the PayMongo checkout for ${flowLabel} ${reference}. No fulfillment should begin.`,
      url,
      payload: basePayload,
    });
  }

  if (session.status === GuestPayMongoStatus.EXPIRED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_CHECKOUT_EXPIRED',
      title: 'PayMongo Checkout Expired',
      message: `The PayMongo checkout for ${flowLabel} ${reference} expired before completion.`,
      url,
      payload: basePayload,
    });
  }

  if (session.status === GuestPayMongoStatus.FAILED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_PAYMENT_FAILED',
      title: 'PayMongo Payment Failed',
      message: `Payment for ${flowLabel} ${reference} failed. ${session.errorMessage || 'The guest may retry with a new checkout.'}`,
      url,
      payload: basePayload,
    });
  }

  if (session.status === GuestPayMongoStatus.PAID_REVIEW_REQUIRED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_REVIEW_REQUIRED',
      title: 'PayMongo Payment Needs Review',
      message: `${amount} was received for ${flowLabel} ${reference}, but CloudView requires staff review. ${session.errorMessage || session.refundErrorMessage || ''}`.trim(),
      url,
      payload: basePayload,
    });
  }

  return null;
}

export async function notifyPosPayMongoStatus(input: {
  sessionId: string;
  eventId?: string | null;
}) {
  const session = await db.posPayMongoSession.findUnique({
    where: {
      id: input.sessionId,
    },
    select: {
      id: true,
      hotelId: true,
      status: true,
      amountCents: true,
      checkoutSessionId: true,
      paymongoPaymentId: true,
      orderCode: true,
      serviceRequestCodes: true,
      errorMessage: true,
    },
  });

  if (!session || session.status === POSPayMongoStatus.PENDING) {
    return null;
  }

  const serviceCodes = jsonStringArray(session.serviceRequestCodes);
  const reference =
    session.orderCode ||
    (serviceCodes.length ? serviceCodes.join(', ') : null) ||
    `POS payment ${session.id.slice(-8).toUpperCase()}`;
  const amount = money(session.amountCents);
  const payload = {
    dedupeKey: `pos:${session.id}:${session.status}:${input.eventId ?? ''}`,
    posPayMongoSessionId: session.id,
    checkoutSessionId: session.checkoutSessionId ?? '',
    paymongoPaymentId: session.paymongoPaymentId ?? '',
    status: session.status,
    reference,
    amountCents: session.amountCents,
    eventId: input.eventId ?? '',
  } satisfies Record<string, Prisma.JsonValue>;

  if (session.status === POSPayMongoStatus.PAID) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_POS_PAID',
      title: 'POS PayMongo Payment Confirmed',
      message: `${amount} was confirmed for ${reference}. The POS can now finalize the sale.`,
      url: '/dashboard/pos',
      payload,
    });
  }

  if (session.status === POSPayMongoStatus.COMPLETED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_POS_COMPLETED',
      title: 'POS PayMongo Sale Completed',
      message: `${reference} was completed successfully after PayMongo confirmation.`,
      url: '/dashboard/pos',
      payload,
    });
  }

  if (session.status === POSPayMongoStatus.CANCELLED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_POS_CANCELLED',
      title: 'POS PayMongo Checkout Cancelled',
      message: `The PayMongo checkout for ${reference} was cancelled.`,
      url: '/dashboard/pos',
      payload,
    });
  }

  if (session.status === POSPayMongoStatus.FAILED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_POS_FAILED',
      title: 'POS PayMongo Payment Failed',
      message: `PayMongo payment for ${reference} failed. ${session.errorMessage || ''}`.trim(),
      url: '/dashboard/pos',
      payload,
    });
  }

  if (session.status === POSPayMongoStatus.PAID_REVIEW_REQUIRED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_POS_REVIEW_REQUIRED',
      title: 'POS PayMongo Payment Needs Review',
      message: `${amount} was received for ${reference}, but the transaction requires staff review. ${session.errorMessage || ''}`.trim(),
      url: '/dashboard/pos',
      payload,
    });
  }

  return null;
}

export async function notifyGuestPayMongoRefundStatus(input: {
  refundId: string;
  eventId?: string | null;
}) {
  const refund = await db.guestPayMongoRefund.findUnique({
    where: {
      id: input.refundId,
    },
    select: {
      id: true,
      status: true,
      amountCents: true,
      paymongoRefundId: true,
      errorMessage: true,
      orderId: true,
      orderItemId: true,
      serviceRequestId: true,
      guestPaymentSession: {
        select: {
          id: true,
          hotelId: true,
          flowType: true,
          orderCode: true,
          serviceRequestCodes: true,
        },
      },
    },
  });

  if (
    !refund ||
    refund.status === GuestPayMongoRefundStatus.NOT_REQUESTED
  ) {
    return null;
  }

  const session = refund.guestPaymentSession;
  const reference = guestReference({
    orderCode: session.orderCode,
    serviceRequestCodes: session.serviceRequestCodes,
    sessionId: session.id,
  });
  const amount = money(refund.amountCents);
  const url = guestFlowUrl(session.flowType);
  const payload = {
    dedupeKey: `refund:${refund.id}:${refund.status}:${input.eventId ?? ''}`,
    guestPayMongoSessionId: session.id,
    guestPayMongoRefundId: refund.id,
    paymongoRefundId: refund.paymongoRefundId ?? '',
    status: refund.status,
    flowType: session.flowType,
    reference,
    amountCents: refund.amountCents,
    orderId: refund.orderId ?? '',
    orderItemId: refund.orderItemId ?? '',
    serviceRequestId: refund.serviceRequestId ?? '',
    eventId: input.eventId ?? '',
  } satisfies Record<string, Prisma.JsonValue>;

  if (
    refund.status === GuestPayMongoRefundStatus.PENDING ||
    refund.status === GuestPayMongoRefundStatus.PROCESSING
  ) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_REFUND_PENDING',
      title: 'PayMongo Refund Processing',
      message: `${amount} refund for ${reference} is being processed by PayMongo.`,
      url,
      payload,
    });
  }

  if (refund.status === GuestPayMongoRefundStatus.SUCCEEDED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_REFUND_SUCCEEDED',
      title: 'PayMongo Refund Completed',
      message: `${amount} was refunded successfully for ${reference}.`,
      url,
      payload,
    });
  }

  if (refund.status === GuestPayMongoRefundStatus.FAILED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'PAYMONGO_REFUND_FAILED',
      title: 'PayMongo Refund Failed',
      message: `${amount} refund for ${reference} failed and needs retry or manual review. ${refund.errorMessage || ''}`.trim(),
      url,
      payload,
    });
  }

  return null;
}
