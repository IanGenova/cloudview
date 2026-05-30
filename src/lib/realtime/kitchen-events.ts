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

function getCentrifugoApiUrl() {
  const apiUrl = process.env.CENTRIFUGO_HTTP_API_URL;

  if (!apiUrl) {
    console.warn('CENTRIFUGO_HTTP_API_URL is missing. Kitchen realtime skipped.');
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
    console.warn('CENTRIFUGO_HTTP_API_KEY is missing. Kitchen realtime skipped.');
    return null;
  }

  return apiKey;
}

function getKitchenChannel(hotelId: string) {
  return `kitchen-${hotelId}`;
}

async function publishKitchenEvent(data: KitchenPublication) {
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
        channel: getKitchenChannel(data.hotelId),
        data,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Centrifugo kitchen publish failed:', response.status, text);
    }
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