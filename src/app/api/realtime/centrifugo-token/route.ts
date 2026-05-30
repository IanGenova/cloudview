import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { getCurrentNfcGuestSession } from '@/lib/nfc-guest-session';
import { createCentrifugoConnectionToken } from '@/lib/realtime/centrifugo-token';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);

  const tagCode = url.searchParams.get('tagCode') || '';
  const orderCode = url.searchParams.get('orderCode') || '';

  if (!tagCode || !orderCode) {
    return NextResponse.json(
      {
        error: 'tagCode and orderCode are required.',
      },
      {
        status: 400,
      }
    );
  }

  const tag = await requireNfcGuestAccess(tagCode);

  if (!tag) {
    return NextResponse.json(
      {
        error: 'Invalid NFC access.',
      },
      {
        status: 401,
      }
    );
  }

  const guestSession = await getCurrentNfcGuestSession(tagCode);

  if (!guestSession) {
    return NextResponse.json(
      {
        error: 'Guest session expired.',
      },
      {
        status: 401,
      }
    );
  }

  const order = await db.order.findFirst({
    where: {
      orderCode,
      hotelId: tag.hotelId,
      tagId: tag.id,
      guestSessionId: guestSession.id,
    },
    select: {
      id: true,
    },
  });

  if (!order) {
    return NextResponse.json(
      {
        error: 'Order not found in current guest session.',
      },
      {
        status: 404,
      }
    );
  }

  const token = createCentrifugoConnectionToken({
    subject: `guest:${guestSession.id}`,
    ttlSeconds: 60 * 60,
  });

  return NextResponse.json({
    token,
  });
}