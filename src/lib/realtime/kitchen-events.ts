import type { OrderStatus, PaymentStatus } from '@prisma/client';

type KitchenEventType =
  | 'kitchen-order-created'
  | 'kitchen-order-updated'
  | 'kitchen-order-paid';

type KitchenPublication = {
  event: KitchenEventType;
  hotelId: string;
  orderCode: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  source?: 'GUEST_PORTAL' | 'POS_TERMINAL' | 'DASHBOARD' | 'KITCHEN';
  updatedAt: string;
};

type CentrifugoPublishResponse = {
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
};

function removeTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function normalizeCentrifugoApiPublishUrl(rawUrl: string) {
  const cleanedUrl = removeTrailingSlash(rawUrl.trim());

  if (!cleanedUrl) {
    return null;
  }

  if (cleanedUrl.endsWith('/api/publish')) {
    return cleanedUrl;
  }

  if (cleanedUrl.endsWith('/api')) {
    return `${cleanedUrl}/publish`;
  }

  if (cleanedUrl.endsWith('/publish')) {
    const withoutPublish = cleanedUrl.replace(/\/publish$/, '');

    if (withoutPublish.endsWith('/api')) {
      return cleanedUrl;
    }

    return `${withoutPublish}/api/publish`;
  }

  return `${cleanedUrl}/api/publish`;
}

function convertWebsocketUrlToHttpApiUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);

    if (url.protocol === 'wss:') {
      url.protocol = 'https:';
    }

    if (url.protocol === 'ws:') {
      url.protocol = 'http:';
    }

    url.pathname = '/api';
    url.search = '';
    url.hash = '';

    return normalizeCentrifugoApiPublishUrl(url.toString());
  } catch {
    return null;
  }
}

function getCentrifugoApiUrl() {
  const explicitApiUrl =
    process.env.CENTRIFUGO_HTTP_API_URL ||
    process.env.CENTRIFUGO_API_URL ||
    process.env.NEXT_PUBLIC_CENTRIFUGO_HTTP_API_URL;

  if (explicitApiUrl) {
    const publishUrl = normalizeCentrifugoApiPublishUrl(explicitApiUrl);

    if (publishUrl) {
      return publishUrl;
    }
  }

  const websocketUrl = process.env.NEXT_PUBLIC_CENTRIFUGO_WS_URL;

  if (websocketUrl) {
    const publishUrl = convertWebsocketUrlToHttpApiUrl(websocketUrl);

    if (publishUrl) {
      return publishUrl;
    }
  }

  const host =
    process.env.NEXT_PUBLIC_CENTRIFUGO_HOST ||
    process.env.NEXT_PUBLIC_LAN_IP ||
    'localhost';

  const port = process.env.NEXT_PUBLIC_CENTRIFUGO_PORT || '8000';

  const shouldUseHttps =
    process.env.NEXT_PUBLIC_FORCE_HTTPS === 'true' ||
    process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://');

  const protocol = shouldUseHttps ? 'https' : 'http';

  return `${protocol}://${host}:${port}/api/publish`;
}

function getCentrifugoApiKey() {
  const apiKey =
    process.env.CENTRIFUGO_HTTP_API_KEY || process.env.CENTRIFUGO_API_KEY;

  if (!apiKey?.trim()) {
    console.warn(
      'CENTRIFUGO_HTTP_API_KEY or CENTRIFUGO_API_KEY is missing. Kitchen realtime publish skipped.'
    );
    return null;
  }

  return apiKey.trim();
}

function getKitchenChannel(hotelId: string) {
  return `kitchen-${hotelId}`;
}

function validateKitchenPublication(data: KitchenPublication) {
  if (!data.hotelId?.trim()) {
    throw new Error('Kitchen realtime publish failed: hotelId is missing.');
  }

  if (!data.orderCode?.trim()) {
    throw new Error('Kitchen realtime publish failed: orderCode is missing.');
  }
}

async function publishKitchenEvent(data: KitchenPublication) {
  validateKitchenPublication(data);

  const publishUrl = getCentrifugoApiUrl();
  const apiKey = getCentrifugoApiKey();

  if (!publishUrl || !apiKey) {
    return;
  }

  const channel = getKitchenChannel(data.hotelId);

  try {
    console.info('Publishing kitchen realtime event:', {
      url: publishUrl,
      channel,
      event: data.event,
      orderCode: data.orderCode,
      source: data.source,
    });

    const response = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Centrifugo-Error-Mode': 'transport',
      },
      body: JSON.stringify({
        channel,
        data,
      }),
      cache: 'no-store',
    });

    const responseText = await response.text();

    let responseJson: CentrifugoPublishResponse | null = null;

    if (responseText) {
      try {
        responseJson = JSON.parse(responseText) as CentrifugoPublishResponse;
      } catch {
        responseJson = null;
      }
    }

    if (!response.ok) {
      console.error('Centrifugo kitchen publish failed:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
      });
      return;
    }

    if (responseJson?.error) {
      console.error('Centrifugo kitchen publish returned API error:', {
        code: responseJson.error.code,
        message: responseJson.error.message,
        body: responseJson,
      });
      return;
    }

    console.info('Kitchen realtime event published successfully:', {
      channel,
      event: data.event,
      orderCode: data.orderCode,
    });
  } catch (error) {
    console.error('Centrifugo kitchen publish error:', error);
  }
}

export async function triggerKitchenOrderCreated({
  hotelId,
  orderCode,
  status,
  source,
}: {
  hotelId: string;
  orderCode: string;
  status: OrderStatus;
  source: 'GUEST_PORTAL' | 'POS_TERMINAL' | 'DASHBOARD';
}) {
  await publishKitchenEvent({
    event: 'kitchen-order-created',
    hotelId,
    orderCode,
    status,
    source,
    updatedAt: new Date().toISOString(),
  });
}

export async function triggerKitchenOrderUpdated({
  hotelId,
  orderCode,
  status,
  source = 'KITCHEN',
}: {
  hotelId: string;
  orderCode: string;
  status: OrderStatus;
  source?: 'DASHBOARD' | 'KITCHEN';
}) {
  await publishKitchenEvent({
    event: 'kitchen-order-updated',
    hotelId,
    orderCode,
    status,
    source,
    updatedAt: new Date().toISOString(),
  });
}

export async function triggerKitchenOrderPaid({
  hotelId,
  orderCode,
  paymentStatus,
}: {
  hotelId: string;
  orderCode: string;
  paymentStatus: PaymentStatus;
}) {
  await publishKitchenEvent({
    event: 'kitchen-order-paid',
    hotelId,
    orderCode,
    paymentStatus,
    source: 'DASHBOARD',
    updatedAt: new Date().toISOString(),
  });
}