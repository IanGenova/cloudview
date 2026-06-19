import { publishManyToCentrifugo } from '@/lib/realtime/centrifugo-publisher';
import { realtimeChannels } from '@/lib/realtime/channels';

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

function validateLowStockAlertPayload(data: LowStockAlertPayload) {
  if (!data.hotelId?.trim()) {
    throw new Error('Low stock alert publish failed: hotelId is missing.');
  }

  if (!data.inventoryItemId?.trim()) {
    throw new Error(
      'Low stock alert publish failed: inventoryItemId is missing.'
    );
  }

  if (!data.itemName?.trim()) {
    throw new Error('Low stock alert publish failed: itemName is missing.');
  }
}

function validateCancelledItemAlertPayload(data: CancelledItemAlertPayload) {
  if (!data.hotelId?.trim()) {
    throw new Error('Cancelled order alert publish failed: hotelId is missing.');
  }

  if (!data.orderCode?.trim()) {
    throw new Error(
      'Cancelled order alert publish failed: orderCode is missing.'
    );
  }
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

  validateLowStockAlertPayload(data);

  await publishManyToCentrifugo([
    {
      channel: realtimeChannels.dashboardHotelInventory(payload.hotelId),
      data,
      debugLabel: 'dashboard-hotel-low-stock-alert',
    },
    {
      channel: realtimeChannels.dashboardGlobalInventory(),
      data,
      debugLabel: 'dashboard-global-low-stock-alert',
    },
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

  validateCancelledItemAlertPayload(data);

  await publishManyToCentrifugo([
    {
      channel: realtimeChannels.dashboardHotelOrders(payload.hotelId),
      data,
      debugLabel: 'dashboard-hotel-order-cancelled-alert',
    },
    {
      channel: realtimeChannels.dashboardGlobalOrders(),
      data,
      debugLabel: 'dashboard-global-order-cancelled-alert',
    },
  ]);
}