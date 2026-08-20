import { publishManyToCentrifugo } from '@/lib/realtime/centrifugo-publisher';
import { realtimeChannels } from '@/lib/realtime/channels';
import { createDashboardNotification } from '@/lib/dashboard-notifications';

/**
 * Record the alert in the notification centre as well as publishing it.
 *
 * A Centrifugo publish is fire-and-forget: it only reaches dashboards that are
 * open and connected at that instant. If realtime is down — or nobody is
 * looking — the alert is lost with no trace. Persisting it means the bell picks
 * it up on its next poll and it survives until someone reads it.
 */
async function recordAlertNotification(input: {
  hotelId: string;
  type: 'LOW_STOCK' | 'ORDER_UPDATED';
  title: string;
  message: string;
  url: string;
  payload: Record<string, unknown>;
}) {
  try {
    await createDashboardNotification({
      hotelId: input.hotelId,
      type: input.type,
      title: input.title,
      message: input.message,
      url: input.url,
      payload: input.payload as never,
    });
  } catch (error) {
    // Never let notification persistence break the realtime publish path.
    console.error('Failed to persist dashboard alert notification:', error);
  }
}

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

  await recordAlertNotification({
    hotelId: payload.hotelId,
    type: 'LOW_STOCK',
    title: 'Low Stock Alert',
    message: `${payload.itemName} is down to ${payload.availableQty} ${payload.unit} (reorder level ${payload.reorderLevel}).`,
    url: '/dashboard/inventory',
    payload: {
      inventoryItemId: payload.inventoryItemId,
      itemName: payload.itemName,
      availableQty: payload.availableQty,
      reorderLevel: payload.reorderLevel,
      unit: payload.unit,
      source: payload.source ?? null,
    },
  });

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

  await recordAlertNotification({
    hotelId: payload.hotelId,
    type: 'ORDER_UPDATED',
    title: payload.wholeOrderCancelled
      ? 'Order Cancelled'
      : 'Order Item Cancelled',
    message: payload.wholeOrderCancelled
      ? `${payload.orderCode} was cancelled.${
          payload.reason ? ` Reason: ${payload.reason}` : ''
        }`
      : `${payload.cancelledQty ?? 1}× ${
          payload.itemName ?? 'item'
        } cancelled on ${payload.orderCode}.${
          payload.reason ? ` Reason: ${payload.reason}` : ''
        }`,
    url: '/dashboard/orders',
    payload: {
      orderId: payload.orderId ?? null,
      orderCode: payload.orderCode,
      itemName: payload.itemName ?? null,
      cancelledQty: payload.cancelledQty ?? null,
      reason: payload.reason ?? null,
      wholeOrderCancelled: Boolean(payload.wholeOrderCancelled),
      source: payload.source ?? null,
    },
  });

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