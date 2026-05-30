import crypto from 'crypto';

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

function getCentrifugoTokenSecret() {
  const secret = process.env.CENTRIFUGO_TOKEN_HMAC_SECRET;

  if (!secret) {
    throw new Error('CENTRIFUGO_TOKEN_HMAC_SECRET is missing.');
  }

  return secret;
}

export function createCentrifugoConnectionToken({
  subject,
  ttlSeconds = 60 * 60,
}: {
  subject: string;
  ttlSeconds?: number;
}) {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    typ: 'JWT',
    alg: 'HS256',
  };

  const payload = {
    sub: subject,
    iat: now,
    exp: now + ttlSeconds,
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', getCentrifugoTokenSecret())
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64Url(signature)}`;
}