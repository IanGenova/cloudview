import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { GET as handleNfcLaunch } from '@/lib/nfc-launch-handler';
import {
  resolveConfiguredNfcPublicOrigin,
} from '@/lib/nfc-public-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeSlug(value: string) {
  try {
    return decodeURIComponent(value)
      .trim()
      .toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

/**
 * Build redirects from CloudView's configured public origin.
 *
 * Do not clone request.nextUrl here. Behind Nginx, Next.js may see the
 * internal upstream origin such as localhost:3000 or 127.0.0.1:3000.
 */
function accessDeniedUrl(reason: string) {
  const publicOrigin =
    resolveConfiguredNfcPublicOrigin();

  const url = new URL(
    '/nfc-access-denied',
    publicOrigin
  );

  url.searchParams.set('reason', reason);

  console.warn(
    '[Hotel-aware NFC] Access denied redirect.',
    {
      reason,
      redirectOrigin: url.origin,
    }
  );

  return url;
}

/**
 * Hotel-aware NFC launch:
 *
 * /n/HOTEL-SLUG/TAGCODE?k=SECRET
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

    const hotelSlug =
      normalizeSlug(hotelSlugInput);

    const nfcCode =
      normalizeSlug(nfcCodeInput)
        .toUpperCase();

    if (!hotelSlug || !nfcCode) {
      return NextResponse.redirect(
        accessDeniedUrl('tag-not-found'),
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

    const storedHotelSlug =
      tag?.hotel?.slug
        ? normalizeSlug(tag.hotel.slug)
        : '';

    if (
      !tag ||
      tag.deletedAt ||
      !tag.hotel.isActive ||
      storedHotelSlug !== hotelSlug
    ) {
      console.warn(
        '[Hotel-aware NFC] Tag validation failed.',
        {
          requestedTagCode: nfcCode,
          requestedHotelSlug: hotelSlug,
          tagExists: Boolean(tag),
          deletedAt: tag?.deletedAt ?? null,
          hotelActive:
            tag?.hotel?.isActive ?? null,
          storedHotelSlug:
            storedHotelSlug || null,
        }
      );

      return NextResponse.redirect(
        accessDeniedUrl('tag-not-found'),
        307
      );
    }

    /*
     * Use the original secure NFC launch handler directly.
     * This preserves all existing secret, session, room and cookie checks.
     */
    return handleNfcLaunch(request, {
      params: Promise.resolve({
        tagCode: tag.code,
      }),
    });
  } catch (error) {
    console.error(
      '[Hotel-aware NFC] Launch failed.',
      error
    );

    return NextResponse.redirect(
      accessDeniedUrl(
        'session-check-failed'
      ),
      307
    );
  }
}
