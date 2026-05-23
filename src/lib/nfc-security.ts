import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';

export const NFC_ACCESS_COOKIE = 'cv_nfc_access';

function getAccessTtlMinutes() {
  return Number(process.env.NFC_ACCESS_TTL_MINUTES || 60);
}

function getIdleTimeoutMinutes() {
  return Number(process.env.NFC_IDLE_TIMEOUT_MINUTES || 15);
}

function appSecret() {
  return process.env.AUTH_SECRET || 'dev-change-this-secret';
}

export function getPublicAppUrl() {
  const rawUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const lanIp = process.env.NEXT_PUBLIC_LAN_IP;

  if (rawUrl.includes('0.0.0.0')) {
    if (lanIp) return `http://${lanIp}:3000`;
    return 'http://localhost:3000';
  }

  return rawUrl.replace(/\/$/, '');
}

export function randomSecret() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashValue(value: string) {
  return crypto
    .createHash('sha256')
    .update(`${value}:${appSecret()}`)
    .digest('hex');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;

  return crypto.timingSafeEqual(left, right);
}

export function verifyTagSecret(inputSecret: string, storedSecret: string) {
  return safeEqual(hashValue(inputSecret), hashValue(storedSecret));
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

async function getRequestFingerprint() {
  const h = await headers();

  const userAgent = h.get('user-agent') || 'unknown';
  const forwardedFor = h.get('x-forwarded-for') || '';
  const realIp = h.get('x-real-ip') || '';
  const ip = forwardedFor.split(',')[0]?.trim() || realIp || 'local';

  return {
    userAgentHash: hashValue(userAgent),
    ipHash: hashValue(ip)
  };
}

async function expireSessionAndRedirect(sessionId: string | null, tagCode: string) {
  if (sessionId) {
    await db.nfcAccessSession.update({
      where: {
        id: sessionId
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  redirect(
    `${getPublicAppUrl()}/nfc-access-denied?tag=${encodeURIComponent(
      tagCode
    )}&reason=expired`
  );
}

export async function createNfcAccessSession(tag: {
  id: string;
  hotelId: string;
}) {
  const cookieStore = await cookies();
  const fingerprint = await getRequestFingerprint();

  const now = new Date();

  const absoluteExpiresAt = addMinutes(now, getAccessTtlMinutes());
  const idleExpiresAt = minDate(
    addMinutes(now, getIdleTimeoutMinutes()),
    absoluteExpiresAt
  );

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashValue(rawToken);

  await db.nfcAccessSession.create({
    data: {
      tagId: tag.id,
      hotelId: tag.hotelId,
      tokenHash,
      userAgentHash: fingerprint.userAgentHash,
      ipHash: fingerprint.ipHash,
      expiresAt: absoluteExpiresAt,
      idleExpiresAt,
      lastSeenAt: now
    }
  });

  cookieStore.set(NFC_ACCESS_COOKIE, rawToken, {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/'
  });
}

export async function requireNfcGuestAccess(tagCode: string) {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(NFC_ACCESS_COOKIE)?.value;

  if (!rawToken) {
    redirect(
      `${getPublicAppUrl()}/nfc-access-denied?tag=${encodeURIComponent(
        tagCode
      )}&reason=no-session`
    );
  }

  const tag = await db.nfcTag.findUnique({
    where: {
      code: tagCode
    },
    include: {
      hotel: {
        include: {
          settings: true
        }
      },
      room: true,
      location: true
    }
  });

  if (!tag || tag.status !== 'ACTIVE' || tag.deletedAt) {
    redirect(`${getPublicAppUrl()}/nfc-access-denied?reason=inactive-tag`);
  }

  const now = new Date();
  const tokenHash = hashValue(rawToken);
  const fingerprint = await getRequestFingerprint();

  const session = await db.nfcAccessSession.findFirst({
    where: {
      tagId: tag.id,
      tokenHash,
      revokedAt: null
    }
  });

  if (!session) {
    redirect(
      `${getPublicAppUrl()}/nfc-access-denied?tag=${encodeURIComponent(
        tagCode
      )}&reason=invalid-session`
    );
  }

  if (session.expiresAt <= now) {
    await expireSessionAndRedirect(session.id, tagCode);
  }

  if (session.idleExpiresAt && session.idleExpiresAt <= now) {
    await expireSessionAndRedirect(session.id, tagCode);
  }

  if (session.userAgentHash && session.userAgentHash !== fingerprint.userAgentHash) {
    await expireSessionAndRedirect(session.id, tagCode);
  }

  const nextIdleExpiresAt = minDate(
    addMinutes(now, getIdleTimeoutMinutes()),
    session.expiresAt
  );

  await db.nfcAccessSession.update({
    where: {
      id: session.id
    },
    data: {
      lastSeenAt: now,
      idleExpiresAt: nextIdleExpiresAt
    }
  });

  return tag;
}

export function secureNfcLaunchUrl(code: string, scanSecret?: string | null) {
  const baseUrl = getPublicAppUrl();

  if (!scanSecret) return '';

  return `${baseUrl}/n/${code}?k=${scanSecret}`;
}

export function protectedGuestUrl(code: string) {
  const baseUrl = getPublicAppUrl();

  return `${baseUrl}/t/${code}`;
}