import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}

function accessDeniedUrl(request: NextRequest, reason: string) {
  const url = request.nextUrl.clone();

  url.pathname = '/nfc-access-denied';
  url.search = '';
  url.searchParams.set('reason', reason);

  return url;
}

/**
 * Hotel-aware NFC URL:
 *
 * /n/cloud-view-demo/YQTWLQ5Z?k=SECRET
 *
 * Because the parent folder is named [tagCode], the first parameter contains
 * the hotel slug for this two-segment route.
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

    /**
     * Forward to the original secure NFC handler.
     *
     * The original ?k=SECRET query parameter is preserved.
     */
    const legacyUrl = request.nextUrl.clone();

    legacyUrl.pathname = `/n/${encodeURIComponent(tag.code)}`;

    return NextResponse.redirect(legacyUrl, 307);
  } catch (error) {
    console.error(
      '[Hotel-aware NFC launch] Failed to validate NFC link.',
      error
    );

    return NextResponse.redirect(
      accessDeniedUrl(request, 'session-check-failed'),
      307
    );
  }
}
