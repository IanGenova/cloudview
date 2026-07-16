import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

function normalizeSlug(value: string) {
  return value.trim().toLowerCase();
}

function accessDeniedUrl(request: Request, reason: string) {
  const url = new URL('/nfc-access-denied', request.url);
  url.searchParams.set('reason', reason);

  return url;
}

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      hotelSlug: string;
      tagCode: string;
    }>;
  }
) {
  const { hotelSlug, tagCode } = await params;

  const normalizedHotelSlug = normalizeSlug(hotelSlug);
  const normalizedTagCode = tagCode.trim();

  if (!normalizedHotelSlug || !normalizedTagCode) {
    return NextResponse.redirect(
      accessDeniedUrl(request, 'tag-not-found')
    );
  }

  /*
   * Validate that the tag belongs to the hotel specified in the URL.
   * The existing /n/[tagCode] route will still perform the secret, NFC status,
   * stay, room, device and session checks.
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
    normalizeSlug(tag.hotel.slug) !== normalizedHotelSlug
  ) {
    /*
     * Do not reveal the correct hotel when somebody supplies a wrong slug.
     */
    return NextResponse.redirect(
      accessDeniedUrl(request, 'tag-not-found')
    );
  }

  /*
   * Reuse the existing, fully tested NFC launch route internally.
   *
   * The browser keeps showing:
   * /n/{hotelSlug}/{tagCode}?k=...
   *
   * Internally Next.js processes:
   * /n/{tagCode}?k=...
   */
  const internalUrl = new URL(request.url);
  internalUrl.pathname = `/n/${encodeURIComponent(tag.code)}`;

  return NextResponse.rewrite(internalUrl);
}