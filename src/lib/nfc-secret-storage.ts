import crypto from 'crypto';

/**
 * How an NFC tag's scan secret is kept at rest.
 *
 * The secret is a bearer credential: whoever holds it can open that tag's guest
 * portal. It used to be stored as plaintext, and verification hashed *both*
 * sides before comparing — which reads like defence but is exactly equivalent
 * to comparing the plaintext directly. A database dump handed an attacker
 * working credentials for every tag in the estate.
 *
 * Two columns replace it, because the secret has two jobs that want opposite
 * things:
 *
 *   scanSecretHash    what verification compares against. One-way.
 *   scanSecretCipher  what the dashboard decrypts so staff can re-print a tag's
 *                     URL, write a duplicate chip, or finish a bulk rollout.
 *
 * A stolen database yields a hash that cannot be reversed and a ciphertext
 * whose key lives in the environment, not the database.
 */

const CIPHER_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * SHA-256 with no pepper, deliberately.
 *
 * `hashValue()` elsewhere in this codebase mixes in AUTH_SECRET, which is right
 * for values an attacker could guess. A scan secret is 128 bits of CSPRNG
 * output, so there is no dictionary to defend against and a pepper buys
 * essentially nothing.
 *
 * What it would cost is severe: once hashes are *stored*, peppering welds every
 * physical tag's validity to AUTH_SECRET. Rotating that key — an ordinary,
 * healthy thing to do — would silently stop every tag already mounted on a
 * wall, with no error and no way to recover short of re-programming the estate.
 * Keeping this unsalted keeps AUTH_SECRET rotatable.
 */
export function hashTagSecret(secret: string) {
  return crypto
    .createHash('sha256')
    .update(String(secret ?? ''), 'utf8')
    .digest('hex');
}

/**
 * The key used to encrypt the re-displayable copy.
 *
 * NFC_SECRET_ENC_KEY is honoured when set, so this can be moved onto a
 * dedicated key later without touching code. Absent that it is derived from
 * AUTH_SECRET, matching how guest-stay passcodes are already encrypted — which
 * means this ships without a new required environment variable, and a deploy
 * that forgets one does not quietly lose the ability to re-print tag URLs.
 *
 * A dedicated key buys little isolation in practice while both values live in
 * the same .env file, so the fallback is the honest default rather than a
 * shortcut.
 *
 * Whatever this returns, it never affects verification: hashTagSecret() is
 * independent of it, so rotating either value degrades re-display only.
 */
function encryptionKey() {
  const explicit = process.env.NFC_SECRET_ENC_KEY?.trim();

  if (explicit) {
    if (/^[0-9a-fA-F]{64}$/.test(explicit)) {
      return Buffer.from(explicit, 'hex');
    }

    const decoded = Buffer.from(explicit, 'base64');

    if (decoded.length === KEY_BYTES) {
      return decoded;
    }

    console.warn(
      '[nfc] NFC_SECRET_ENC_KEY must be 32 bytes as hex or base64. ' +
        'Falling back to the AUTH_SECRET-derived key.'
    );
  }

  const authSecret = process.env.AUTH_SECRET?.trim();

  if (!authSecret) {
    return null;
  }

  return crypto
    .createHash('sha256')
    .update(authSecret)
    .digest();
}

export function isTagSecretEncryptionConfigured() {
  return encryptionKey() !== null;
}

/**
 * Returns null when no key is configured. Callers persist that null and carry
 * on: a tag with a hash but no ciphertext still authenticates, it just cannot
 * have its URL shown again.
 */
export function encryptTagSecret(secret: string) {
  const key = encryptionKey();

  if (!key) {
    return null;
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(String(secret ?? ''), 'utf8'),
    cipher.final(),
  ]);

  return [
    CIPHER_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Null on anything that does not decrypt cleanly — wrong key, tampered
 * ciphertext, malformed input, no key configured. Re-display is a convenience,
 * so it degrades quietly rather than taking a dashboard page down.
 */
export function decryptTagSecret(stored: string | null | undefined) {
  const key = encryptionKey();
  const raw = String(stored ?? '').trim();

  if (!key || !raw) {
    return null;
  }

  const parts = raw.split('.');

  if (parts.length !== 4 || parts[0] !== CIPHER_VERSION) {
    return null;
  }

  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const authTag = Buffer.from(parts[2], 'base64url');
    const ciphertext = Buffer.from(parts[3], 'base64url');

    if (iv.length !== IV_BYTES) {
      return null;
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Authentication failure or malformed input. Both mean "cannot show it".
    return null;
  }
}

/**
 * Everything needed to persist a freshly minted secret, plus the plaintext for
 * the one moment it is useful — writing it to a chip.
 */
export function buildTagSecretRecord(secret: string) {
  return {
    secret,
    scanSecretHash: hashTagSecret(secret),
    scanSecretCipher: encryptTagSecret(secret),
  };
}

/**
 * The plaintext for display, or null when it cannot be recovered.
 *
 * `scanSecret` is the legacy plaintext column. It is read here so tags keep
 * working between deploying this change and running the backfill, and it goes
 * away when that column is dropped.
 */
export function readableTagSecret(tag: {
  scanSecretCipher?: string | null;
  scanSecret?: string | null;
}) {
  return (
    decryptTagSecret(tag.scanSecretCipher) ??
    (tag.scanSecret ? String(tag.scanSecret) : null)
  );
}
