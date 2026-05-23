import { NextResponse } from 'next/server';
import {
  createNfcAccessSession,
  getPublicAppUrl,
  verifyTagSecret
} from '@/lib/nfc-security';
import { db } from '@/lib/db';

function publicUrl(path: string) {
  return new URL(path, getPublicAppUrl());
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tagCode: string }> }
) {
  const { tagCode } = await params;
  const url = new URL(request.url);
  const inputSecret = url.searchParams.get('k') || '';

  const tag = await db.nfcTag.findUnique({
    where: {
      code: tagCode
    }
  });

  if (!tag || tag.status !== 'ACTIVE' || tag.deletedAt) {
    return NextResponse.redirect(publicUrl('/nfc-access-denied?reason=inactive-tag'));
  }

  if (!tag.scanSecret || !inputSecret || !verifyTagSecret(inputSecret, tag.scanSecret)) {
    return NextResponse.redirect(publicUrl('/nfc-access-denied?reason=bad-secret'));
  }

  await db.$transaction([
    db.nfcTag.update({
      where: {
        id: tag.id
      },
      data: {
        lastScannedAt: new Date()
      }
    }),

    db.nfcAccessSession.updateMany({
      where: {
        tagId: tag.id,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    }),

    db.nfcAccessSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    })
  ]);

  await createNfcAccessSession({
    id: tag.id,
    hotelId: tag.hotelId
  });

  return NextResponse.redirect(publicUrl(`/t/${tag.code}?nfcSession=1`));
}