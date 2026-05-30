import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import {
  createNfcAccessSession,
  getPublicAppUrl,
  verifyTagSecret,
} from '@/lib/nfc-security';
import { db } from '@/lib/db';
import { getNfcGuestSessionCookieName } from '@/lib/nfc-guest-session';

function publicUrl(path: string) {
  return new URL(path, getPublicAppUrl());
}

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tagCode: string }> }
) {
  const { tagCode } = await params;
  const url = new URL(request.url);
  const inputSecret = url.searchParams.get('k') || '';

  const tag = await db.nfcTag.findUnique({
    where: {
      code: tagCode,
    },
    select: {
      id: true,
      code: true,
      hotelId: true,
      roomId: true,
      locationId: true,
      status: true,
      scanSecret: true,
      deletedAt: true,
    },
  });

  if (!tag || tag.deletedAt) {
    return NextResponse.redirect(
      publicUrl('/nfc-access-denied?reason=tag-not-found')
    );
  }

  if (
    !tag.scanSecret ||
    !inputSecret ||
    !verifyTagSecret(inputSecret, tag.scanSecret)
  ) {
    return NextResponse.redirect(
      publicUrl('/nfc-access-denied?reason=bad-secret')
    );
  }

  const guestSessionKey = randomUUID();

  await db.$transaction([
    db.nfcTag.update({
      where: {
        id: tag.id,
      },
      data: {
        lastScannedAt: new Date(),
      },
    }),

    db.nfcAccessSession.updateMany({
      where: {
        tagId: tag.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    }),

    db.nfcAccessSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    }),

    db.nfcGuestSession.updateMany({
      where: {
        tagId: tag.id,
        endedAt: null,
      },
      data: {
        endedAt: new Date(),
      },
    }),

    db.nfcGuestSession.create({
      data: {
        sessionKey: guestSessionKey,
        hotelId: tag.hotelId,
        tagId: tag.id,
        roomId: tag.roomId,
        locationId: tag.locationId,
      },
    }),
  ]);

  await createNfcAccessSession({
    id: tag.id,
    hotelId: tag.hotelId,
  });

  const redirectUrl =
    tag.status === 'ACTIVE'
      ? publicUrl(`/t/${tag.code}?nfcSession=1`)
      : publicUrl(`/t/${tag.code}?nfcSession=1&tagStatus=inactive`);

  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set(getNfcGuestSessionCookieName(tag.code), guestSessionKey, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24,
  });

  return response;
}