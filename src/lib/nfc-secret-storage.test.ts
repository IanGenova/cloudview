import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decryptTagSecret,
  encryptTagSecret,
  hashTagSecret,
  isTagSecretEncryptionConfigured,
} from './nfc-secret-storage';

const KEY_A =
  '0'.repeat(64);
const KEY_B =
  'f'.repeat(64);

/**
 * Runs `run` with an explicit key. Passing undefined means "no key material at
 * all", which has to clear AUTH_SECRET too, since that is the fallback the key
 * is derived from when NFC_SECRET_ENC_KEY is absent.
 */
function withKey<T>(key: string | undefined, run: () => T): T {
  const previousKey = process.env.NFC_SECRET_ENC_KEY;
  const previousAuth = process.env.AUTH_SECRET;

  if (key === undefined) {
    delete process.env.NFC_SECRET_ENC_KEY;
    delete process.env.AUTH_SECRET;
  } else {
    process.env.NFC_SECRET_ENC_KEY = key;
  }

  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  };

  try {
    return run();
  } finally {
    restore('NFC_SECRET_ENC_KEY', previousKey);
    restore('AUTH_SECRET', previousAuth);
  }
}

test('hash is stable for the same secret', () => {
  assert.equal(hashTagSecret('abc'), hashTagSecret('abc'));
});

test('hash differs for different secrets', () => {
  assert.notEqual(hashTagSecret('abc'), hashTagSecret('abd'));
});

test('hash is 64 hex characters', () => {
  assert.match(hashTagSecret('abc'), /^[0-9a-f]{64}$/);
});

test('hash does NOT depend on AUTH_SECRET', () => {
  // The whole point of leaving this unsalted: rotating AUTH_SECRET must never
  // invalidate a physical tag that is already mounted on a wall.
  const previous = process.env.AUTH_SECRET;

  process.env.AUTH_SECRET = 'one';
  const first = hashTagSecret('tag-secret');

  process.env.AUTH_SECRET = 'two';
  const second = hashTagSecret('tag-secret');

  if (previous === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = previous;
  }

  assert.equal(first, second);
});

test('encrypt then decrypt round-trips', () => {
  withKey(KEY_A, () => {
    const secret = 'KwkxUvLHRz-9_LMDM24HTg';
    const cipher = encryptTagSecret(secret);

    assert.ok(cipher);
    assert.equal(decryptTagSecret(cipher), secret);
  });
});

test('ciphertext differs every call (random IV)', () => {
  withKey(KEY_A, () => {
    assert.notEqual(encryptTagSecret('same'), encryptTagSecret('same'));
  });
});

test('ciphertext does not contain the plaintext', () => {
  withKey(KEY_A, () => {
    const cipher = encryptTagSecret('PLAINTEXTMARKER') ?? '';

    assert.ok(!cipher.includes('PLAINTEXTMARKER'));
  });
});

test('tampered ciphertext fails authentication', () => {
  withKey(KEY_A, () => {
    const cipher = encryptTagSecret('secret') ?? '';
    const parts = cipher.split('.');

    // Flip a character in the ciphertext segment.
    const body = parts[3];
    parts[3] = (body[0] === 'A' ? 'B' : 'A') + body.slice(1);

    assert.equal(decryptTagSecret(parts.join('.')), null);
  });
});

test('a different key cannot decrypt', () => {
  const cipher = withKey(KEY_A, () => encryptTagSecret('secret')) ?? '';

  withKey(KEY_B, () => {
    assert.equal(decryptTagSecret(cipher), null);
  });
});

test('encryption is a no-op when no key material exists at all', () => {
  withKey(undefined, () => {
    assert.equal(isTagSecretEncryptionConfigured(), false);
    assert.equal(encryptTagSecret('secret'), null);
  });
});

test('falls back to an AUTH_SECRET-derived key so deploys need no new config', () => {
  withKey(undefined, () => {
    process.env.AUTH_SECRET = 'some-deployment-auth-secret';

    assert.equal(isTagSecretEncryptionConfigured(), true);

    const cipher = encryptTagSecret('fallback-secret');

    assert.ok(cipher);
    assert.equal(decryptTagSecret(cipher), 'fallback-secret');
  });
});

test('an explicit key wins over the AUTH_SECRET fallback', () => {
  const cipher = withKey(KEY_A, () => {
    process.env.AUTH_SECRET = 'irrelevant';

    return encryptTagSecret('secret');
  });

  // Decryptable with the explicit key...
  withKey(KEY_A, () => {
    assert.equal(decryptTagSecret(cipher), 'secret');
  });

  // ...and not with the AUTH_SECRET-derived one.
  withKey(undefined, () => {
    process.env.AUTH_SECRET = 'irrelevant';

    assert.equal(decryptTagSecret(cipher), null);
  });
});

test('decrypt returns null rather than throwing on junk', () => {
  withKey(KEY_A, () => {
    assert.equal(decryptTagSecret('not-a-cipher'), null);
    assert.equal(decryptTagSecret(''), null);
    assert.equal(decryptTagSecret('v9.a.b.c'), null);
  });
});

test('verification still works when the encryption key is lost', () => {
  // Losing NFC_SECRET_ENC_KEY must degrade re-display only. The hash is
  // independent of it, so mounted tags keep authenticating.
  const secret = 'KwkxUvLHRz-9_LMDM24HTg';
  const hash = withKey(KEY_A, () => hashTagSecret(secret));

  withKey(undefined, () => {
    assert.equal(hashTagSecret(secret), hash);
  });
});
