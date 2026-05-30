type InventoryEventType = 'inventory-stock-updated';

type InventoryPublication = {
  event: InventoryEventType;
  hotelId: string;
  productIds: string[];
  source: 'GUEST_PORTAL' | 'POS_TERMINAL' | 'DASHBOARD';
  updatedAt: string;
};

function getCentrifugoApiUrl() {
  const apiUrl = process.env.CENTRIFUGO_HTTP_API_URL;

  if (!apiUrl) {
    console.warn(
      'CENTRIFUGO_HTTP_API_URL is missing. Inventory realtime skipped.'
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
      'CENTRIFUGO_HTTP_API_KEY is missing. Inventory realtime skipped.'
    );
    return null;
  }

  return apiKey;
}

function getInventoryChannel(hotelId: string) {
  return `inventory-${hotelId}`;
}

async function publishInventoryEvent(data: InventoryPublication) {
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
        channel: getInventoryChannel(data.hotelId),
        data,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        'Centrifugo inventory publish failed:',
        response.status,
        text
      );
    }
  } catch (error) {
    console.error('Centrifugo inventory publish error:', error);
  }
}

export async function triggerInventoryUpdated({
  hotelId,
  productIds,
  source,
}: {
  hotelId: string;
  productIds: string[];
  source: 'GUEST_PORTAL' | 'POS_TERMINAL' | 'DASHBOARD';
}) {
  await publishInventoryEvent({
    event: 'inventory-stock-updated',
    hotelId,
    productIds,
    source,
    updatedAt: new Date().toISOString(),
  });
}