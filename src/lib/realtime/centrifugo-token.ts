import crypto from 'crypto';

type CentrifugoConnectionTokenInput = {
  subject: string;
  ttlSeconds?: number;
};

function base64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

function getCentrifugoTokenSecret() {
  const secret = process.env.CENTRIFUGO_TOKEN_HMAC_SECRET?.trim();

  if (!secret) {
    throw new Error(
      'CENTRIFUGO_TOKEN_HMAC_SECRET is missing. Add it to .env.local and make sure it matches the Centrifugo token_hmac_secret_key / client.token.hmac_secret_key.'
    );
  }

  if (secret.length < 16) {
    throw new Error(
      'CENTRIFUGO_TOKEN_HMAC_SECRET is too short. Use a stronger secret and make sure the same value is used in Centrifugo config.'
    );
  }

  return secret;
}

function getJwtNowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function signHs256(signingInput: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(signingInput).digest();
}

export function createCentrifugoConnectionToken({
  subject,
  ttlSeconds = 60 * 60,
}: CentrifugoConnectionTokenInput) {
  const safeSubject = subject?.trim();

  if (!safeSubject) {
    throw new Error(
      'Centrifugo connection token subject is missing. The subject must be a non-empty user/session id.'
    );
  }

  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('Centrifugo token ttlSeconds must be greater than 0.');
  }

  const now = getJwtNowSeconds();

  const header = {
    typ: 'JWT',
    alg: 'HS256',
  };

  const payload = {
    sub: safeSubject,
    iat: now,
    exp: now + ttlSeconds,
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = signHs256(signingInput, getCentrifugoTokenSecret());

  return `${signingInput}.${base64Url(signature)}`;
}

export function decodeCentrifugoTokenForDebug(token: string) {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const [, encodedPayload] = token.split('.');

  if (!encodedPayload) {
    return null;
  }

  try {
    const normalizedPayload = encodedPayload
      .replaceAll('-', '+')
      .replaceAll('_', '/');

    const paddedPayload = normalizedPayload.padEnd(
      Math.ceil(normalizedPayload.length / 4) * 4,
      '='
    );

    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf8')) as {
      sub?: string;
      iat?: number;
      exp?: number;
    };
  } catch {
    return null;
  }
}