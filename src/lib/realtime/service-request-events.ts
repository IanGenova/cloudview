import type { ServiceRequestStatus } from '@prisma/client';
import { publishManyToCentrifugo } from '@/lib/realtime/centrifugo-publisher';
import { realtimeChannels } from '@/lib/realtime/channels';

type ServiceRequestEventType =
  | 'service-request-created'
  | 'service-request-updated'
  | 'service-request-billed';

type ServiceRequestPublication = {
  event: ServiceRequestEventType;
  hotelId: string;
  requestId: string;
  requestCode: string;
  status: ServiceRequestStatus;
  source: 'GUEST_PORTAL' | 'DASHBOARD';
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

async function publishServiceRequestEvent(data: ServiceRequestPublication) {
  validateServiceRequestPublication(data);

  await publishManyToCentrifugo([
    {
      channel: realtimeChannels.serviceRequests(data.hotelId),
      data,
      debugLabel: `hotel-${data.event}`,
    },
    {
      channel: realtimeChannels.serviceRequestsGlobal(),
      data,
      debugLabel: `global-${data.event}`,
    },
  ]);
}

export async function triggerServiceRequestCreated({
  hotelId,
  requestId,
  requestCode,
  status,
}: {
  hotelId: string;
  requestId: string;
  requestCode: string;
  status: ServiceRequestStatus;
}) {
  await publishServiceRequestEvent({
    event: 'service-request-created',
    hotelId,
    requestId,
    requestCode,
    status,
    source: 'GUEST_PORTAL',
    updatedAt: new Date().toISOString(),
  });
}

export async function triggerServiceRequestUpdated({
  hotelId,
  requestId,
  requestCode,
  status,
  billed,
}: {
  hotelId: string;
  requestId: string;
  requestCode: string;
  status: ServiceRequestStatus;
  billed?: boolean;
}) {
  await publishServiceRequestEvent({
    event: billed ? 'service-request-billed' : 'service-request-updated',
    hotelId,
    requestId,
    requestCode,
    status,
    source: 'DASHBOARD',
    updatedAt: new Date().toISOString(),
  });
}