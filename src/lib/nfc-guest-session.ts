import { cookies } from 'next/headers';
import { db } from '@/lib/db';

export function getNfcGuestSessionCookieName(tagCode: string) {
  const safeTagCode = tagCode.replace(/[^a-zA-Z0-9_-]/g, '_');

  return `cv_nfc_session_${safeTagCode}`;
}

export async function getCurrentNfcGuestSession(tagCode: string) {
  const cookieStore = await cookies();
  const cookieName = getNfcGuestSessionCookieName(tagCode);
  const sessionKey = cookieStore.get(cookieName)?.value;

  if (!sessionKey) {
    return null;
  }

  const session = await db.nfcGuestSession.findUnique({
    where: {
      sessionKey,
    },
    select: {
      id: true,
      sessionKey: true,
      hotelId: true,
      tagId: true,
      roomId: true,
      locationId: true,
      endedAt: true,
    },
  });

  if (!session || session.endedAt) {
    return null;
  }

  await db.nfcGuestSession.update({
    where: {
      id: session.id,
    },
    data: {
      lastSeenAt: new Date(),
    },
  });

  return session;
}

export async function requireCurrentNfcGuestSession(tagCode: string) {
  const session = await getCurrentNfcGuestSession(tagCode);

  if (!session) {
    throw new Error('Guest session expired. Please tap the NFC card again.');
  }

  return session;
}