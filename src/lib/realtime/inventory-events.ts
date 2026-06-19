import { publishManyToCentrifugo } from '@/lib/realtime/centrifugo-publisher';
import { realtimeChannels } from '@/lib/realtime/channels';

type InventoryEventType = 'inventory-stock-updated';

type InventoryPublication = {
  event: InventoryEventType;
  hotelId: string;
  productIds: string[];
  source: 'GUEST_PORTAL' | 'POS_TERMINAL' | 'DASHBOARD';
  updatedAt: string;
};

function validateInventoryPublication(data: InventoryPublication) {
  if (!data.hotelId?.trim()) {
    throw new Error('Inventory realtime publish failed: hotelId is missing.');
  }

  if (!Array.isArray(data.productIds)) {
    throw new Error(
      'Inventory realtime publish failed: productIds must be an array.'
    );
  }
}

async function publishInventoryEvent(data: InventoryPublication) {
  validateInventoryPublication(data);

  await publishManyToCentrifugo([
    {
      channel: realtimeChannels.inventory(data.hotelId),
      data,
      debugLabel: 'hotel-inventory-stock-updated',
    },
    {
      channel: realtimeChannels.inventoryGlobal(),
      data,
      debugLabel: 'global-inventory-stock-updated',
    },
  ]);
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
    productIds: Array.from(new Set(productIds.filter(Boolean))),
    source,
    updatedAt: new Date().toISOString(),
  });
}