import { NextResponse } from 'next/server';
import { requireNfcGuestAccess } from '@/lib/nfc-security';
import { getCurrentNfcGuestSession } from '@/lib/nfc-guest-session';
import { createCentrifugoConnectionToken } from '@/lib/realtime/centrifugo-token';
import { realtimeChannels } from '@/lib/realtime/channels';

export const dynamic = 'force-dynamic';

function cleanParam(value: string | null, maxLength = 160) {
  return String(value ?? '').trim().slice(0, maxLength);
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
  const tagCode = cleanParam(url.searchParams.get('tagCode'));

  if (!tagCode) {
    return jsonError('tagCode is required.', 400);
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

  const token = createCentrifugoConnectionToken({
    subject: `guest:${guestSession.id}:service-requests`,
    ttlSeconds: 60 * 60,
  });

  return NextResponse.json({
    token,
    channels: [realtimeChannels.guestServiceRequests(guestSession.id)],
  });
}
