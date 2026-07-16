import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}

function sameOriginUrl(request: NextRequest, path: string) {
  const url = request.nextUrl.clone();

  url.pathname = path;

  return url;
}

function accessDeniedUrl(request: NextRequest, reason: string) {
  const url = sameOriginUrl(request, '/nfc-access-denied');

  url.search = '';
  url.searchParams.set('reason', reason);

  return url;
}

/**
 * Hotel-aware NFC URL:
 *
 * /n/country-village/HGDYHQ85?k=SECRET
 *
 * Because the existing first dynamic route is named [tagCode], the first
 * parameter represents the hotel slug here. The second parameter is the
 * actual NFC code.
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
  try {
    const {
      tagCode: hotelSlugInput,
      nfcCode: nfcCodeInput,
    } = await params;

    const hotelSlug = normalizeSlug(hotelSlugInput);
    const nfcCode = nfcCodeInput.trim();

    if (!hotelSlug || !nfcCode) {
      return NextResponse.redirect(
        accessDeniedUrl(request, 'tag-not-found'),
        307
      );
    }

    const tag = await db.nfcTag.findUnique({
      where: {
        code: nfcCode,
      },
      select: {
        code: true,
        status: true,
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
      normalizeSlug(tag.hotel.slug) !== hotelSlug
    ) {
      return NextResponse.redirect(
        accessDeniedUrl(request, 'tag-not-found'),
        307
      );
    }

    /*
     * Forward to the existing secure NFC route.
     *
     * The existing route performs:
     * - ?k=SECRET verification
     * - active/inactive NFC checks
     * - private-room verification
     * - guest session creation
     * - secure cookie creation
     * - final guest-portal redirect
     *
     * request.nextUrl.clone() preserves the original ?k=SECRET.
     */
    const secureRouteUrl = request.nextUrl.clone();

    secureRouteUrl.pathname = `/n/${encodeURIComponent(tag.code)}`;

    return NextResponse.redirect(secureRouteUrl, 307);
  } catch (error) {
    console.error(
      '[Hotel-aware NFC launch] Unable to validate the NFC link.',
      error
    );

    return NextResponse.redirect(
      accessDeniedUrl(request, 'session-check-failed'),
      307
    );
  }
}