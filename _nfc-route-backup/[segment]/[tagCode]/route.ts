import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { GET as handleNfcLaunch } from '@/lib/nfc-launch-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalize(value: string) {
  return decodeURIComponent(value).trim().toLowerCase();
}

function accessDeniedUrl(request: NextRequest, reason: string) {
  const url = new URL('/nfc-access-denied', request.url);
  url.searchParams.set('reason', reason);

  return url;
}

/**
 * Hotel-aware NFC URL:
 *
 * /n/country-village/HGDYHQ85?k=SECRET
 *
 * "segment" represents the hotel slug at this route depth.
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      segment: string;
      tagCode: string;
    }>;
  }
) {
  try {
    const { segment, tagCode } = await params;

    const hotelSlug = normalize(segment);
    const normalizedTagCode = decodeURIComponent(tagCode).trim();

    if (!hotelSlug || !normalizedTagCode) {
      return NextResponse.redirect(
        accessDeniedUrl(request, 'tag-not-found'),
        307
      );
    }

    /*
     * Confirm that the NFC tag belongs to the hotel slug in the URL.
     * Do not reveal the correct hotel when the supplied slug is wrong.
     */
    const tag = await db.nfcTag.findUnique({
      where: {
        code: normalizedTagCode,
      },
      select: {
        code: true,
        deletedAt: true,
        hotel: {
          select: {
            slug: true,
            isActive: true,
          },
        },
      },
    });

    if (
      !tag ||
      tag.deletedAt ||
      !tag.hotel.isActive ||
      normalize(tag.hotel.slug) !== hotelSlug
    ) {
      return NextResponse.redirect(
        accessDeniedUrl(request, 'tag-not-found'),
        307
      );
    }

    /*
     * Reuse the original secure NFC handler.
     *
     * That handler remains responsible for:
     * - validating ?k=SECRET
     * - checking whether the NFC tag is active
     * - validating private room access
     * - creating the guest NFC session
     * - setting secure cookies
     * - redirecting to the guest portal
     */
    return handleNfcLaunch(request, {
      params: Promise.resolve({
        tagCode: tag.code,
      }),
    });
  } catch (error) {
    console.error(
      '[Hotel NFC Launch] Unable to process the hotel-aware NFC link.',
      error
    );

    return NextResponse.redirect(
      accessDeniedUrl(request, 'session-check-failed'),
      307
    );
  }
}
