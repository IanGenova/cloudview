type LowStockAlertPayload = {
  event: 'inventory.low_stock';
  hotelId: string;
  inventoryItemId: string;
  itemName: string;
  availableQty: number;
  reorderLevel: number;
  unit: string;
  source?: string;
  updatedAt: string;
};

type CancelledItemAlertPayload = {
  event: 'order.item_cancelled' | 'order.cancelled';
  hotelId: string;
  orderId?: string;
  orderCode: string;
  itemName?: string;
  cancelledQty?: number;
  reason?: string;
  source?: string;
  updatedAt: string;
};

type DashboardAlertPayload = LowStockAlertPayload | CancelledItemAlertPayload;

function getCentrifugoApiBaseUrl() {
  const raw =
    process.env.CENTRIFUGO_API_URL ||
    process.env.CENTRIFUGO_HTTP_API_URL ||
    '';

  return raw.replace(/\/+$/, '').replace(/\/api$/, '');
}

function getCentrifugoApiKey() {
  return (
    process.env.CENTRIFUGO_API_KEY ||
    process.env.CENTRIFUGO_HTTP_API_KEY ||
    ''
  );
}

async function publishToCentrifugo(
  channel: string,
  data: DashboardAlertPayload
) {
  const apiBaseUrl = getCentrifugoApiBaseUrl();
  const apiKey = getCentrifugoApiKey();

  if (!apiBaseUrl || !apiKey) {
    console.warn(
      'Centrifugo publish skipped. Missing CENTRIFUGO_API_URL/CENTRIFUGO_HTTP_API_URL or CENTRIFUGO_API_KEY/CENTRIFUGO_HTTP_API_KEY.'
    );
    return;
  }

  const publishUrl = `${apiBaseUrl}/api/publish`;

  try {
    const response = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        channel,
        data,
      }),
      cache: 'no-store',
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      console.warn(
        `Centrifugo publish failed. Channel: ${channel}. HTTP ${response.status}`,
        result
      );
      return;
    }

    if (result?.error) {
      console.warn('Centrifugo publish returned error:', result.error);
    }
  } catch (error) {
    console.warn(
      `Centrifugo publish request failed. URL: ${publishUrl}. Channel: ${channel}`,
      error
    );
  }
}

function getHotelInventoryChannel(hotelId: string) {
  return `dashboard:hotel:${hotelId}:inventory`;
}

function getHotelOrdersChannel(hotelId: string) {
  return `dashboard:hotel:${hotelId}:orders`;
}

function getGlobalInventoryChannel() {
  return 'dashboard:global:inventory';
}

function getGlobalOrdersChannel() {
  return 'dashboard:global:orders';
}

export async function publishLowStockAlert(payload: {
  hotelId: string;
  inventoryItemId: string;
  itemName: string;
  availableQty: number;
  reorderLevel: number;
  unit: string;
  source?: string;
}) {
  const data: LowStockAlertPayload = {
    event: 'inventory.low_stock',
    hotelId: payload.hotelId,
    inventoryItemId: payload.inventoryItemId,
    itemName: payload.itemName,
    availableQty: payload.availableQty,
    reorderLevel: payload.reorderLevel,
    unit: payload.unit,
    source: payload.source,
    updatedAt: new Date().toISOString(),
  };

  await Promise.allSettled([
    publishToCentrifugo(getHotelInventoryChannel(payload.hotelId), data),
    publishToCentrifugo(getGlobalInventoryChannel(), data),
  ]);
}

export async function publishCancelledItemAlert(payload: {
  hotelId: string;
  orderId?: string;
  orderCode: string;
  itemName?: string;
  cancelledQty?: number;
  reason?: string;
  source?: string;
  wholeOrderCancelled?: boolean;
}) {
  const data: CancelledItemAlertPayload = {
    event: payload.wholeOrderCancelled
      ? 'order.cancelled'
      : 'order.item_cancelled',
    hotelId: payload.hotelId,
    orderId: payload.orderId,
    orderCode: payload.orderCode,
    itemName: payload.itemName,
    cancelledQty: payload.cancelledQty,
    reason: payload.reason,
    source: payload.source,
    updatedAt: new Date().toISOString(),
  };

  await Promise.allSettled([
    publishToCentrifugo(getHotelOrdersChannel(payload.hotelId), data),
    publishToCentrifugo(getGlobalOrdersChannel(), data),
  ]);
}