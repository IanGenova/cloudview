import type { OrderStatus, PaymentStatus } from '@prisma/client';

type CentrifugoPublication = {
  event: 'order-status-updated' | 'order-payment-updated';
  orderCode: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  updatedAt: string;
};

function getCentrifugoApiUrl() {
  const apiUrl = process.env.CENTRIFUGO_HTTP_API_URL;

  if (!apiUrl) {
    console.warn('CENTRIFUGO_HTTP_API_URL is missing. Realtime events skipped.');
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
    console.warn('CENTRIFUGO_HTTP_API_KEY is missing. Realtime events skipped.');
    return null;
  }

  return apiKey;
}

function getOrderChannel(orderCode: string) {
  return `order-${orderCode}`;
}

async function publishOrderEvent(data: CentrifugoPublication) {
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
        channel: getOrderChannel(data.orderCode),
        data,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Centrifugo publish failed:', response.status, text);
    }
  } catch (error) {
    console.error('Centrifugo publish error:', error);
  }
}

export async function triggerOrderStatusUpdate({
  orderCode,
  status,
  updatedAt,
}: {
  orderCode: string;
  status: OrderStatus;
  updatedAt: string;
}) {
  await publishOrderEvent({
    event: 'order-status-updated',
    orderCode,
    status,
    updatedAt,
  });
}

export async function triggerOrderPaidUpdate({
  orderCode,
  paymentStatus,
  updatedAt,
}: {
  orderCode: string;
  paymentStatus: PaymentStatus;
  updatedAt: string;
}) {
  await publishOrderEvent({
    event: 'order-payment-updated',
    orderCode,
    paymentStatus,
    updatedAt,
  });
}