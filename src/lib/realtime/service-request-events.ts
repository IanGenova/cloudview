import 'server-only';

import type {
  GuestXenditRefundStatus,
  PaymentStatus,
  ServiceRequestStatus,
} from '@prisma/client';
import { db } from '@/lib/db';
import { publishManyToCentrifugo } from '@/lib/realtime/centrifugo-publisher';
import { realtimeChannels } from '@/lib/realtime/channels';

type ServiceRequestEventType =
  | 'service-request-created'
  | 'service-request-updated'
  | 'service-request-billed'
  | 'service-request-payment-updated'
  | 'service-request-refund-updated';

type ServiceRequestPublication = {
  event: ServiceRequestEventType;
  hotelId: string;
  requestId: string;
  requestCode: string;
  status: ServiceRequestStatus;
  source: 'GUEST_PORTAL' | 'DASHBOARD' | 'XENDIT' | 'SYSTEM';
  paymentStatus?: PaymentStatus;
  refundStatus?: GuestXenditRefundStatus;
  refundedAmountCents?: number;
  refundErrorMessage?: string | null;
  billed?: boolean;
  guestSessionId?: string | null;
  updatedAt: string;
};

function validateServiceRequestPublication(data: ServiceRequestPublication) {
  if (!data.hotelId?.trim()) {
    throw new Error(
      'Service request realtime publish failed: hotelId is missing.'
    );
  }

  if (!data.requestId?.trim()) {
    throw new Error(
      'Service request realtime publish failed: requestId is missing.'
    );
  }

  if (!data.requestCode?.trim()) {
    throw new Error(
      'Service request realtime publish failed: requestCode is missing.'
    );
  }
}

async function resolveGuestSessionId(data: ServiceRequestPublication) {
  if (data.guestSessionId?.trim()) {
    return data.guestSessionId.trim();
  }

  const request = await db.serviceRequest.findUnique({
    where: {
      id: data.requestId,
    },
    select: {
      guestSessionId: true,
    },
  });

  return request?.guestSessionId ?? null;
}

async function publishServiceRequestEvent(data: ServiceRequestPublication) {
  validateServiceRequestPublication(data);

  const guestSessionId = await resolveGuestSessionId(data);
  const publication = {
    ...data,
    guestSessionId,
  };

  const publications = [
    {
      channel: realtimeChannels.serviceRequests(data.hotelId),
      data: publication,
      debugLabel: `hotel-${data.event}`,
    },
    {
      channel: realtimeChannels.serviceRequestsGlobal(),
      data: publication,
      debugLabel: `global-${data.event}`,
    },
  ];

  if (guestSessionId) {
    publications.push({
      channel: realtimeChannels.guestServiceRequests(guestSessionId),
      data: publication,
      debugLabel: `guest-${data.event}`,
    });
  }

  await publishManyToCentrifugo(publications);
}

export async function triggerServiceRequestCreated({
  hotelId,
  requestId,
  requestCode,
  status,
  guestSessionId,
}: {
  hotelId: string;
  requestId: string;
  requestCode: string;
  status: ServiceRequestStatus;
  guestSessionId?: string | null;
}) {
  await publishServiceRequestEvent({
    event: 'service-request-created',
    hotelId,
    requestId,
    requestCode,
    status,
    source: 'GUEST_PORTAL',
    guestSessionId,
    updatedAt: new Date().toISOString(),
  });
}

export async function triggerServiceRequestUpdated({
  hotelId,
  requestId,
  requestCode,
  status,
  billed,
  paymentStatus,
  guestSessionId,
  source = 'DASHBOARD',
}: {
  hotelId: string;
  requestId: string;
  requestCode: string;
  status: ServiceRequestStatus;
  billed?: boolean;
  paymentStatus?: PaymentStatus;
  guestSessionId?: string | null;
  source?: ServiceRequestPublication['source'];
}) {
  await publishServiceRequestEvent({
    event: billed ? 'service-request-billed' : 'service-request-updated',
    hotelId,
    requestId,
    requestCode,
    status,
    source,
    billed: Boolean(billed),
    paymentStatus,
    guestSessionId,
    updatedAt: new Date().toISOString(),
  });
}

export async function triggerServiceRequestPaymentUpdate({
  hotelId,
  requestId,
  requestCode,
  status,
  paymentStatus,
  refundStatus,
  refundedAmountCents = 0,
  refundErrorMessage,
  guestSessionId,
  updatedAt = new Date().toISOString(),
}: {
  hotelId: string;
  requestId: string;
  requestCode: string;
  status: ServiceRequestStatus;
  paymentStatus: PaymentStatus;
  refundStatus?: GuestXenditRefundStatus;
  refundedAmountCents?: number;
  refundErrorMessage?: string | null;
  guestSessionId?: string | null;
  updatedAt?: string;
}) {
  await publishServiceRequestEvent({
    event: refundStatus
      ? 'service-request-refund-updated'
      : 'service-request-payment-updated',
    hotelId,
    requestId,
    requestCode,
    status,
    source: 'XENDIT',
    paymentStatus,
    refundStatus,
    refundedAmountCents,
    refundErrorMessage,
    guestSessionId,
    updatedAt,
  });
}
