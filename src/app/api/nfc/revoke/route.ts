import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { hashValue, NFC_ACCESS_COOKIE } from '@/lib/nfc-security';

export async function POST() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(NFC_ACCESS_COOKIE)?.value;

  if (rawToken) {
    await db.nfcAccessSession.updateMany({
      where: {
        tokenHash: hashValue(rawToken),
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  cookieStore.delete(NFC_ACCESS_COOKIE);

  return NextResponse.json({
    ok: true
  });
}