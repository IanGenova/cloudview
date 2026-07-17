import type { NextRequest } from 'next/server';
import { GET as handleNfcLaunch } from '@/lib/nfc-launch-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeDecodePathSegment(value: string) {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

/**
 * Hotel-aware NFC URL:
 * /n/HOTEL-SLUG/TAGCODE?k=SECRET
 *
 * Do not duplicate the tag lookup in this route. The shared NFC launch
 * handler is the single source of truth for tag, hotel, secret, status,
 * session, room and guest-stay validation.
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      tagCode: string;
      nfcCode: string;
    }>;
  }
) {
  const {
    tagCode: hotelSlugInput,
    nfcCode: nfcCodeInput,
  } = await params;

  const expectedHotelSlug = safeDecodePathSegment(
    hotelSlugInput
  ).toLowerCase();

  const tagCode = safeDecodePathSegment(nfcCodeInput);

  return handleNfcLaunch(request, {
    params: Promise.resolve({
      tagCode,
      expectedHotelSlug,
    }),
  });
}
