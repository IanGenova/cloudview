import type { ServiceRequestStatus } from '@prisma/client';

type ServiceRequestEventType =
  | 'service-request-created'
  | 'service-request-updated'
  | 'service-request-billed';

type ServiceRequestPublication = {
  event: ServiceRequestEventType;
  hotelId: string;
  requestId?: string;
  requestCode?: string;
  status?: ServiceRequestStatus;
  source: 'GUEST_PORTAL' | 'DASHBOARD';
  updatedAt: string;
};

function getCentrifugoApiUrl() {
  const apiUrl = process.env.CENTRIFUGO_HTTP_API_URL;

  if (!apiUrl) {
    console.warn(
      'CENTRIFUGO_HTTP_API_URL is missing. Service request realtime skipped.'
    );
    return null;
  }

  const normalizedUrl = apiUrl.replace(/\/$/, '');

  if (normalizedUrl.endsWith('/publish')) {
    return normalizedUrl;
  }

  return `${normalizedUrl}/publish`;
}

function getCentrifugoApiKey() {
  const apiKey = process.env.CENTRIFUGO_HTTP_API_KEY;

  if (!apiKey) {
    console.warn(
      'CENTRIFUGO_HTTP_API_KEY is missing. Service request realtime skipped.'
    );
    return null;
  }

  return apiKey;
}

function getServiceRequestsChannel(hotelId: string) {
  return `service-requests-${hotelId}`;
}

async function publishServiceRequestEvent(data: ServiceRequestPublication) {
  const publishUrl = getCentrifugoApiUrl();
  const apiKey = getCentrifugoApiKey();

  if (!publishUrl || !apiKey) {
    return;
  }

  try {
    const response = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Centrifugo-Error-Mode': 'transport',
      },
      body: JSON.stringify({
        channel: getServiceRequestsChannel(data.hotelId),
        data,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        'Centrifugo service request publish failed:',
        response.status,
        text
      );
    }
  } catch (error) {
    console.error('Centrifugo service request publish error:', error);
  }
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