import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { getCurrentNfcGuestSession } from '@/lib/nfc-guest-session';
import { createCentrifugoConnectionToken } from '@/lib/realtime/centrifugo-token';
import { realtimeChannels } from '@/lib/realtime/channels';

export const dynamic = 'force-dynamic';

const MAX_ORDER_CHANNELS = 50;

function cleanParam(value: string | null, maxLength = 160) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function parseOrderCodes(url: URL) {
  const singleOrderCode = cleanParam(url.searchParams.get('orderCode'), 120);
  const multipleOrderCodes = String(url.searchParams.get('orderCodes') ?? '')
    .split(',')
    .map((value) => cleanParam(value, 120))
    .filter(Boolean);

  return Array.from(
    new Set([singleOrderCode, ...multipleOrderCodes].filter(Boolean))
  ).slice(0, MAX_ORDER_CHANNELS);
}

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
    }
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const tagCode = cleanParam(url.searchParams.get('tagCode'), 160);
  const orderCodes = parseOrderCodes(url);

  if (!tagCode || orderCodes.length === 0) {
    return jsonError('tagCode and at least one order code are required.', 400);
  }

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag) {
    return jsonError('Invalid NFC access.', 401);
  }

  const guestSession = await getCurrentNfcGuestSession(tagCode);

  if (!guestSession) {
    return jsonError('Guest session expired.', 401);
  }

  if (guestSession.hotelId !== tag.hotelId || guestSession.tagId !== tag.id) {
    return jsonError('Guest session does not match this NFC tag.', 403);
  }

  const orders = await db.order.findMany({
    where: {
      orderCode: {
        in: orderCodes,
      },
      hotelId: tag.hotelId,
      tagId: tag.id,
      guestSessionId: guestSession.id,
    },
    select: {
      id: true,
      orderCode: true,
    },
  });

  if (orders.length === 0) {
    return jsonError('No orders were found in the current guest session.', 404);
  }

  const allowedOrderCodes = new Set(orders.map((order) => order.orderCode));
  const unauthorizedOrderCodes = orderCodes.filter(
    (orderCode) => !allowedOrderCodes.has(orderCode)
  );

  if (unauthorizedOrderCodes.length > 0) {
    return jsonError('One or more orders are not available to this guest.', 403);
  }

  const channels = orders.map((order) =>
    realtimeChannels.guestOrder(order.orderCode)
  );

  const token = createCentrifugoConnectionToken({
    subject: `guest:${guestSession.id}:orders`,
    ttlSeconds: 60 * 60,
  });

  return NextResponse.json({
    token,
    channels,
  });
}
