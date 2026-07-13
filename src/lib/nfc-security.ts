import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';

export const NFC_ACCESS_COOKIE = 'cv_nfc_access';

export function getNfcAccessCookieName(tagCode: string) {
  const safeTagCode = tagCode.replace(/[^a-zA-Z0-9_-]/g, '_');

  return `${NFC_ACCESS_COOKIE}_${safeTagCode}`;
}

function parsePositiveMinutes(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(Math.floor(parsed), maximum));
}

function getAccessTtlMinutes() {
  return parsePositiveMinutes(
    process.env.NFC_ACCESS_TTL_MINUTES,
    60,
    5,
    60 * 24 * 7
  );
}

function getIdleTimeoutMinutes() {
  return parsePositiveMinutes(
    process.env.NFC_IDLE_TIMEOUT_MINUTES,
    15,
    1,
    getAccessTtlMinutes()
  );
}

function appSecret() {
  const value = process.env.AUTH_SECRET?.trim();

  if (value) {
    return value;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production.');
  }

  return 'dev-change-this-secret';
}

function isPrivateLanHostname(hostname: string) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function shouldForceHttpsForHost(hostname: string) {
  const forceHttps = process.env.NEXT_PUBLIC_FORCE_HTTPS;

  if (forceHttps === 'false') {
    return false;
  }

  if (forceHttps === 'true') {
    return true;
  }

  return process.env.NODE_ENV === 'production' && !isPrivateLanHostname(hostname);
}

export function getPublicAppUrl() {
  const lanIp = process.env.NEXT_PUBLIC_LAN_IP?.trim() || 'localhost';
  // NFC links should use the guest-facing URL first.
  // APP_URL stays reserved for server-to-server/public integrations such as
  // Xendit webhook and checkout return URLs.
  const rawUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    `http://${lanIp}:3000`;

  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL or APP_URL must be an absolute URL.');
  }

  if (['0.0.0.0', 'localhost', '127.0.0.1'].includes(url.hostname) && lanIp) {
    url.hostname = lanIp;
  }

  if (shouldForceHttpsForHost(url.hostname)) {
    url.protocol = 'https:';
  }

  if (
    process.env.NODE_ENV === 'production' &&
    !isPrivateLanHostname(url.hostname) &&
    url.protocol !== 'https:'
  ) {
    throw new Error('Public NFC URL must use HTTPS outside private LAN development.');
  }

  if (!url.port && url.protocol === 'http:' && process.env.NODE_ENV !== 'production') {
    url.port = '3000';
  }

  return url.toString().replace(/\/$/, '');
}

export function isHttpsPublicAppUrl() {
  return new URL(getPublicAppUrl()).protocol === 'https:';
}

export async function shouldUseSecureNfcCookies() {
  const forceHttps = process.env.NEXT_PUBLIC_FORCE_HTTPS;

  if (forceHttps === 'true') {
    return true;
  }

  if (forceHttps === 'false') {
    return false;
  }

  const requestHeaders = await headers();
  const forwardedProtocol = requestHeaders
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();

  if (forwardedProtocol === 'https') {
    return true;
  }

  if (forwardedProtocol === 'http') {
    return false;
  }

  return isHttpsPublicAppUrl();
}

function shouldBindNfcSessionToIp() {
  return process.env.NFC_BIND_IP === 'true';
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

  if (left.length !== right.length) {
    return false;
  }

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
  const requestHeaders = await headers();

  const userAgent = requestHeaders.get('user-agent') || 'unknown';
  const forwardedFor = requestHeaders.get('x-forwarded-for') || '';
  const realIp = requestHeaders.get('x-real-ip') || '';
  const ip = forwardedFor.split(',')[0]?.trim() || realIp || 'local';

  return {
    userAgentHash: hashValue(userAgent),
    ipHash: hashValue(ip),
  };
}

function accessDeniedUrl(tagCode: string, reason: string) {
  const query = new URLSearchParams();

  if (tagCode) {
    query.set('tag', tagCode);
  }

  query.set('reason', reason);

  return `/nfc-access-denied?${query.toString()}`;
}

async function expireSessionAndRedirect(
  sessionId: string | null,
  tagCode: string,
  reason = 'expired'
): Promise<never> {
  if (sessionId) {
    await db.nfcAccessSession.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  redirect(accessDeniedUrl(tagCode, reason));
}

export async function createNfcAccessSession(tag: {
  id: string;
  hotelId: string;
  code?: string;
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
      lastSeenAt: now,
    },
  });

  const cookieOptions = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: await shouldUseSecureNfcCookies(),
    path: '/',
    maxAge: getAccessTtlMinutes() * 60,
  };

  const tagCookieName = tag.code ? getNfcAccessCookieName(tag.code) : null;

  if (tagCookieName) {
    cookieStore.set(tagCookieName, rawToken, cookieOptions);
  }

  cookieStore.set(NFC_ACCESS_COOKIE, rawToken, cookieOptions);

  return {
    rawToken,
    tagCookieName,
    legacyCookieName: NFC_ACCESS_COOKIE,
    cookieOptions,
  };
}

export async function requireNfcGuestAccess(tagCodeInput: string) {
  const tagCode = tagCodeInput.trim();

  if (!tagCode) {
    redirect(accessDeniedUrl('', 'invalid-tag'));
  }

  const tag = await db.nfcTag.findUnique({
    where: {
      code: tagCode,
    },
    include: {
      hotel: {
        include: {
          settings: true,
        },
      },
      room: true,
      location: true,
    },
  });

  if (!tag || tag.status !== 'ACTIVE' || tag.deletedAt || !tag.hotel.isActive) {
    redirect(accessDeniedUrl(tagCode, 'inactive-tag'));
  }

  const cookieStore = await cookies();
  const rawToken =
    cookieStore.get(getNfcAccessCookieName(tag.code))?.value ||
    cookieStore.get(NFC_ACCESS_COOKIE)?.value;

  if (!rawToken) {
    redirect(accessDeniedUrl(tagCode, 'no-session'));
  }

  const now = new Date();
  const tokenHash = hashValue(rawToken);
  const fingerprint = await getRequestFingerprint();

  const session = await db.nfcAccessSession.findFirst({
    where: {
      tagId: tag.id,
      hotelId: tag.hotelId,
      tokenHash,
      revokedAt: null,
    },
  });

  if (!session) {
    redirect(accessDeniedUrl(tagCode, 'invalid-session'));
  }

  if (session.expiresAt <= now) {
    await expireSessionAndRedirect(session.id, tagCode, 'expired');
  }

  if (session.idleExpiresAt && session.idleExpiresAt <= now) {
    await expireSessionAndRedirect(session.id, tagCode, 'idle-timeout');
  }

  if (
    session.userAgentHash &&
    session.userAgentHash !== fingerprint.userAgentHash
  ) {
    await expireSessionAndRedirect(session.id, tagCode, 'device-mismatch');
  }

  if (
    shouldBindNfcSessionToIp() &&
    session.ipHash &&
    session.ipHash !== fingerprint.ipHash
  ) {
    await expireSessionAndRedirect(session.id, tagCode, 'network-mismatch');
  }

  const nextIdleExpiresAt = minDate(
    addMinutes(now, getIdleTimeoutMinutes()),
    session.expiresAt
  );

  await db.nfcAccessSession.update({
    where: {
      id: session.id,
    },
    data: {
      lastSeenAt: now,
      idleExpiresAt: nextIdleExpiresAt,
    },
  });

  return tag;
}

export function secureNfcLaunchUrl(code: string, scanSecret?: string | null) {
  if (!scanSecret) {
    return '';
  }

  return `${getPublicAppUrl()}/n/${encodeURIComponent(
    code
  )}?k=${encodeURIComponent(scanSecret)}`;
}

export function protectedGuestUrl(code: string) {
  return `${getPublicAppUrl()}/t/${encodeURIComponent(code)}`;
}