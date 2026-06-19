import type { OrderStatus, PaymentStatus } from '@prisma/client';
import { publishManyToCentrifugo } from '@/lib/realtime/centrifugo-publisher';
import { realtimeChannels } from '@/lib/realtime/channels';

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

  await publishManyToCentrifugo([
    {
      channel: realtimeChannels.kitchen(data.hotelId),
      data,
      debugLabel: `hotel-${data.event}`,
    },
    {
      channel: realtimeChannels.kitchenGlobal(),
      data,
      debugLabel: `global-${data.event}`,
    },
  ]);
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