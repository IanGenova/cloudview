import crypto from 'crypto';

export type GuestStayXenditReturnResult = 'success' | 'cancelled';

type GuestStayXenditReturnPayload = {
  version: 1;
  sessionId: string;
  hotelId: string;
  guestStayId: string;
  result: GuestStayXenditReturnResult;
  expiresAt: number;
};

const DEFAULT_RETURN_TTL_SECONDS = 2 * 60 * 60;

function getReturnSigningSecret() {
  const value = process.env.AUTH_SECRET?.trim();

  if (!value) {
    throw new Error(
      'AUTH_SECRET is required to sign the guest-stay Xendit return state.'
    );
  }

  return value;
}

function signEncodedPayload(encodedPayload: string) {
  return crypto
    .createHmac('sha256', getReturnSigningSecret())
    .update(encodedPayload)
    .digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createGuestStayXenditReturnState(input: {
  sessionId: string;
  hotelId: string;
  guestStayId: string;
  result: GuestStayXenditReturnResult;
  ttlSeconds?: number;
}) {
  const ttlSeconds = Math.max(
    60,
    Math.min(input.ttlSeconds ?? DEFAULT_RETURN_TTL_SECONDS, 24 * 60 * 60)
  );

  const payload: GuestStayXenditReturnPayload = {
    version: 1,
    sessionId: input.sessionId,
    hotelId: input.hotelId,
    guestStayId: input.guestStayId,
    result: input.result,
    expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url'
  );
  const signature = signEncodedPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyGuestStayXenditReturnState(
  tokenInput: string | null | undefined
): GuestStayXenditReturnPayload | null {
  const token = String(tokenInput ?? '').trim();
  const [encodedPayload, suppliedSignature, ...extraParts] = token.split('.');

  if (!encodedPayload || !suppliedSignature || extraParts.length > 0) {
    return null;
  }

  let expectedSignature: string;

  try {
    expectedSignature = signEncodedPayload(encodedPayload);
  } catch {
    return null;
  }

  if (!safeEqual(suppliedSignature, expectedSignature)) {
    return null;
  }

  let payload: unknown;

  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    );
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const value = payload as Partial<GuestStayXenditReturnPayload>;

  if (
    value.version !== 1 ||
    typeof value.sessionId !== 'string' ||
    !value.sessionId.trim() ||
    value.sessionId.length > 191 ||
    typeof value.hotelId !== 'string' ||
    !value.hotelId.trim() ||
    value.hotelId.length > 191 ||
    typeof value.guestStayId !== 'string' ||
    !value.guestStayId.trim() ||
    value.guestStayId.length > 191 ||
    (value.result !== 'success' && value.result !== 'cancelled') ||
    typeof value.expiresAt !== 'number' ||
    !Number.isInteger(value.expiresAt) ||
    value.expiresAt < Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return value as GuestStayXenditReturnPayload;
}
