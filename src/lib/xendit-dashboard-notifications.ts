import 'server-only';

import type { Prisma } from '@prisma/client';
import {
  GuestXenditFlow,
  GuestXenditRefundStatus,
  GuestXenditStatus,
  POSXenditStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { triggerOrderRefundUpdate } from '@/lib/realtime/order-events';
import {
  triggerServiceRequestPaymentUpdate,
} from '@/lib/realtime/service-request-events';

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

function guestFlowLabel(flowType: GuestXenditFlow) {
  return flowType === GuestXenditFlow.FOOD_ORDER
    ? 'food order'
    : 'service request';
}

function guestFlowUrl(flowType: GuestXenditFlow) {
  return flowType === GuestXenditFlow.FOOD_ORDER
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
        source: 'XENDIT',
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

export async function notifyGuestXenditStatus(input: {
  sessionId: string;
  eventId?: string | null;
}) {
  const session = await db.guestXenditSession.findUnique({
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
      xenditPaymentId: true,
      errorMessage: true,
      refundErrorMessage: true,
    },
  });

  if (!session || session.status === GuestXenditStatus.PENDING) {
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
    guestXenditSessionId: session.id,
    checkoutSessionId: session.checkoutSessionId ?? '',
    xenditPaymentId: session.xenditPaymentId ?? '',
    flowType: session.flowType,
    status: session.status,
    reference,
    amountCents: session.amountCents,
    paidAmountCents: session.paidAmountCents ?? session.amountCents,
    refundedAmountCents: session.refundedAmountCents,
    eventId: input.eventId ?? '',
  } satisfies Record<string, Prisma.JsonValue>;

  if (session.status === GuestXenditStatus.PAID) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_PAYMENT_PAID',
      title: 'Xendit Payment Confirmed',
      message: `${amount} was confirmed for ${flowLabel} ${reference}. CloudView is finalizing the transaction.`,
      url,
      payload: basePayload,
    });
  }

  if (session.status === GuestXenditStatus.COMPLETED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_FULFILLMENT_COMPLETED',
      title: 'Xendit Transaction Completed',
      message: `${flowLabel.charAt(0).toUpperCase()}${flowLabel.slice(1)} ${reference} was created successfully after Xendit confirmation.`,
      url,
      payload: basePayload,
    });
  }

  if (session.status === GuestXenditStatus.CANCELLED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_CHECKOUT_CANCELLED',
      title: 'Xendit Checkout Cancelled',
      message: `The guest cancelled the Xendit checkout for ${flowLabel} ${reference}. No fulfillment should begin.`,
      url,
      payload: basePayload,
    });
  }

  if (session.status === GuestXenditStatus.EXPIRED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_CHECKOUT_EXPIRED',
      title: 'Xendit Checkout Expired',
      message: `The Xendit checkout for ${flowLabel} ${reference} expired before completion.`,
      url,
      payload: basePayload,
    });
  }

  if (session.status === GuestXenditStatus.FAILED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_PAYMENT_FAILED',
      title: 'Xendit Payment Failed',
      message: `Payment for ${flowLabel} ${reference} failed. ${session.errorMessage || 'The guest may retry with a new checkout.'}`,
      url,
      payload: basePayload,
    });
  }

  if (session.status === GuestXenditStatus.PAID_REVIEW_REQUIRED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_REVIEW_REQUIRED',
      title: 'Xendit Payment Needs Review',
      message: `${amount} was received for ${flowLabel} ${reference}, but CloudView requires staff review. ${session.errorMessage || session.refundErrorMessage || ''}`.trim(),
      url,
      payload: basePayload,
    });
  }

  return null;
}

export async function notifyPosXenditStatus(input: {
  sessionId: string;
  eventId?: string | null;
}) {
  const session = await db.posXenditSession.findUnique({
    where: {
      id: input.sessionId,
    },
    select: {
      id: true,
      hotelId: true,
      status: true,
      amountCents: true,
      checkoutSessionId: true,
      xenditPaymentId: true,
      orderCode: true,
      serviceRequestCodes: true,
      errorMessage: true,
    },
  });

  if (!session || session.status === POSXenditStatus.PENDING) {
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
    posXenditSessionId: session.id,
    checkoutSessionId: session.checkoutSessionId ?? '',
    xenditPaymentId: session.xenditPaymentId ?? '',
    status: session.status,
    reference,
    amountCents: session.amountCents,
    eventId: input.eventId ?? '',
  } satisfies Record<string, Prisma.JsonValue>;

  if (session.status === POSXenditStatus.PAID) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_POS_PAID',
      title: 'POS Xendit Payment Confirmed',
      message: `${amount} was confirmed for ${reference}. The POS can now finalize the sale.`,
      url: '/dashboard/pos',
      payload,
    });
  }

  if (session.status === POSXenditStatus.COMPLETED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_POS_COMPLETED',
      title: 'POS Xendit Sale Completed',
      message: `${reference} was completed successfully after Xendit confirmation.`,
      url: '/dashboard/pos',
      payload,
    });
  }

  if (session.status === POSXenditStatus.CANCELLED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_POS_CANCELLED',
      title: 'POS Xendit Checkout Cancelled',
      message: `The Xendit checkout for ${reference} was cancelled.`,
      url: '/dashboard/pos',
      payload,
    });
  }

  if (session.status === POSXenditStatus.FAILED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_POS_FAILED',
      title: 'POS Xendit Payment Failed',
      message: `Xendit payment for ${reference} failed. ${session.errorMessage || ''}`.trim(),
      url: '/dashboard/pos',
      payload,
    });
  }

  if (session.status === POSXenditStatus.PAID_REVIEW_REQUIRED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_POS_REVIEW_REQUIRED',
      title: 'POS Xendit Payment Needs Review',
      message: `${amount} was received for ${reference}, but the transaction requires staff review. ${session.errorMessage || ''}`.trim(),
      url: '/dashboard/pos',
      payload,
    });
  }

  return null;
}

export async function notifyGuestXenditRefundStatus(input: {
  refundId: string;
  eventId?: string | null;
}) {
  const refund = await db.guestXenditRefund.findUnique({
    where: {
      id: input.refundId,
    },
    select: {
      id: true,
      status: true,
      amountCents: true,
      xenditRefundId: true,
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
          refundStatus: true,
          refundedAmountCents: true,
          refundErrorMessage: true,
          updatedAt: true,
          order: {
            select: {
              status: true,
              paymentStatus: true,
            },
          },
          serviceRequests: {
            select: {
              id: true,
              hotelId: true,
              requestCode: true,
              status: true,
              paymentStatus: true,
              guestSessionId: true,
            },
          },
        },
      },
    },
  });

  if (
    !refund ||
    refund.status === GuestXenditRefundStatus.NOT_REQUESTED
  ) {
    return null;
  }

  const session = refund.guestPaymentSession;

  if (
    session.flowType === GuestXenditFlow.FOOD_ORDER &&
    session.orderCode &&
    session.order
  ) {
    try {
      await triggerOrderRefundUpdate({
        orderCode: session.orderCode,
        status: session.order.status,
        paymentStatus: session.order.paymentStatus,
        refundStatus: session.refundStatus,
        refundedAmountCents: session.refundedAmountCents,
        refundErrorMessage: session.refundErrorMessage,
        updatedAt: session.updatedAt.toISOString(),
      });
    } catch (error) {
      console.warn('[Guest Xendit] Unable to publish refund realtime update.', {
        refundId: refund.id,
        orderCode: session.orderCode,
        error,
      });
    }
  }

  if (session.flowType === GuestXenditFlow.SERVICE_REQUEST) {
    const affectedRequests = refund.serviceRequestId
      ? session.serviceRequests.filter(
          (request) => request.id === refund.serviceRequestId
        )
      : session.serviceRequests;

    const publications = await Promise.allSettled(
      affectedRequests.map((request) =>
        triggerServiceRequestPaymentUpdate({
          hotelId: request.hotelId,
          requestId: request.id,
          requestCode: request.requestCode,
          status: request.status,
          paymentStatus: request.paymentStatus,
          refundStatus: session.refundStatus,
          refundedAmountCents: session.refundedAmountCents,
          refundErrorMessage: session.refundErrorMessage,
          guestSessionId: request.guestSessionId,
          updatedAt: session.updatedAt.toISOString(),
        })
      )
    );

    const failedPublications = publications.filter(
      (publication) => publication.status === 'rejected'
    );

    if (failedPublications.length > 0) {
      console.warn(
        '[Guest Xendit] One or more service-refund realtime updates failed.',
        {
          refundId: refund.id,
          failedCount: failedPublications.length,
        }
      );
    }
  }

  const reference = guestReference({
    orderCode: session.orderCode,
    serviceRequestCodes: session.serviceRequestCodes,
    sessionId: session.id,
  });
  const amount = money(refund.amountCents);
  const url = guestFlowUrl(session.flowType);
  const payload = {
    dedupeKey: `refund:${refund.id}:${refund.status}:${input.eventId ?? ''}`,
    guestXenditSessionId: session.id,
    guestXenditRefundId: refund.id,
    xenditRefundId: refund.xenditRefundId ?? '',
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
    refund.status === GuestXenditRefundStatus.PENDING ||
    refund.status === GuestXenditRefundStatus.PROCESSING
  ) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_REFUND_PENDING',
      title: 'Xendit Refund Processing',
      message: `${amount} refund for ${reference} is being processed by Xendit.`,
      url,
      payload,
    });
  }

  if (refund.status === GuestXenditRefundStatus.SUCCEEDED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_REFUND_SUCCEEDED',
      title: 'Xendit Refund Completed',
      message: `${amount} was refunded successfully for ${reference}.`,
      url,
      payload,
    });
  }

  if (refund.status === GuestXenditRefundStatus.FAILED) {
    return createUniqueNotification({
      hotelId: session.hotelId,
      type: 'XENDIT_REFUND_FAILED',
      title: 'Xendit Refund Failed',
      message: `${amount} refund for ${reference} failed and needs retry or manual review. ${refund.errorMessage || ''}`.trim(),
      url,
      payload,
    });
  }

  return null;
}
