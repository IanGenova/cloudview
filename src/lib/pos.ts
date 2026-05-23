import { PosSyncStatus } from '@prisma/client';
import { db } from '@/lib/db';

export async function sendOrderToPos(orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      hotel: { include: { posIntegration: true } },
      items: true,
      room: true,
      location: true
    }
  });
  if (!order) throw new Error('Order not found');

  const integration = order.hotel.posIntegration;
  const payload = {
    orderCode: order.orderCode,
    hotelId: order.hotelId,
    room: order.room?.number ?? null,
    location: order.location?.name ?? null,
    totalCents: order.totalCents,
    paymentMethod: order.paymentMethod,
    items: order.items.map((item) => ({
      name: item.productNameSnapshot,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents
    }))
  };

  if (!integration?.enabled) {
    await db.posSyncLog.create({
      data: {
        hotelId: order.hotelId,
        orderId: order.id,
        status: PosSyncStatus.PENDING,
        requestPayload: payload,
        responsePayload: { message: 'POS integration disabled. Order kept pending for manual POS entry.' }
      }
    });
    return { status: PosSyncStatus.PENDING };
  }

  try {
    let responsePayload: unknown = { ok: true, provider: integration.providerName, mockTicket: `POS-${order.orderCode}` };

    if (integration.apiEndpoint) {
      const response = await fetch(integration.apiEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': integration.apiKeyEncrypted ?? ''
        },
        body: JSON.stringify(payload)
      });
      responsePayload = await response.json().catch(() => ({ status: response.status }));
      if (!response.ok) throw new Error(`POS endpoint failed with status ${response.status}`);
    }

    await db.posSyncLog.create({
      data: {
        hotelId: order.hotelId,
        orderId: order.id,
        integrationId: integration.id,
        status: PosSyncStatus.SENT,
        requestPayload: payload,
        responsePayload: responsePayload as object
      }
    });
    await db.order.update({ where: { id: order.id }, data: { posSyncStatus: PosSyncStatus.SENT } });
    return { status: PosSyncStatus.SENT };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown POS error';
    await db.posSyncLog.create({
      data: {
        hotelId: order.hotelId,
        orderId: order.id,
        integrationId: integration.id,
        status: PosSyncStatus.FAILED,
        requestPayload: payload,
        error: message
      }
    });
    await db.order.update({ where: { id: order.id }, data: { posSyncStatus: PosSyncStatus.FAILED } });
    return { status: PosSyncStatus.FAILED, error: message };
  }
}
