/**
 * Moves NFC tag scan secrets off the plaintext column.
 *
 * For every tag that still has `scanSecret`, this writes the SHA-256 hash that
 * verification now uses plus an AES-256-GCM copy for re-display, then clears
 * the plaintext. Physical tags are untouched: the secret written on the chip
 * does not change, only how the database stores it.
 *
 * Run it after `prisma migrate deploy` and before the migration that drops the
 * plaintext column.
 *
 *   npx tsx scripts/backfill-tag-secret-storage.ts            # dry run
 *   npx tsx scripts/backfill-tag-secret-storage.ts --apply    # write
 */
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

import {
  encryptTagSecret,
  hashTagSecret,
  isTagSecretEncryptionConfigured,
} from '../src/lib/nfc-secret-storage';

const prisma = new PrismaClient();

const apply = process.argv.includes('--apply');
const allowNoEncryption = process.argv.includes(
  '--allow-no-encryption'
);

async function main() {
  const encryptionReady = isTagSecretEncryptionConfigured();

  if (!encryptionReady) {
    console.warn(
      'No encryption key available (NFC_SECRET_ENC_KEY, or AUTH_SECRET to\n' +
        'derive one from). Tags would be migrated with a hash but no\n' +
        're-displayable copy, so their URLs could never be shown again.'
    );

    if (!allowNoEncryption) {
      console.error(
        '\nRefusing to run. Set AUTH_SECRET (or NFC_SECRET_ENC_KEY) and try\n' +
          'again, or pass --allow-no-encryption if losing re-display is\n' +
          'genuinely what you want.'
      );
      process.exitCode = 1;
      return;
    }
  }

  const pending = await prisma.nfcTag.findMany({
    where: { scanSecret: { not: null } },
    select: {
      id: true,
      code: true,
      scanSecret: true,
      scanSecretHash: true,
    },
  });

  const total = await prisma.nfcTag.count();

  console.log(
    `tags: ${total} total, ${pending.length} still holding plaintext`
  );

  if (pending.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (!apply) {
    console.log('\nDry run. Would migrate:');
    for (const tag of pending) {
      console.log(
        `  ${tag.code}` +
          (tag.scanSecretHash ? ' (hash already present; would clear plaintext)' : '')
      );
    }
    console.log('\nRe-run with --apply to write.');
    return;
  }

  let migrated = 0;

  for (const tag of pending) {
    const secret = String(tag.scanSecret);

    await prisma.nfcTag.update({
      where: { id: tag.id },
      data: {
        scanSecretHash: tag.scanSecretHash ?? hashTagSecret(secret),
        scanSecretCipher: encryptTagSecret(secret),
        scanSecret: null,
      },
    });

    migrated += 1;
  }

  const remaining = await prisma.nfcTag.count({
    where: { scanSecret: { not: null } },
  });

  console.log(`\nmigrated ${migrated} tag(s); ${remaining} still holding plaintext`);

  if (remaining === 0) {
    console.log(
      'Safe to apply the migration that drops NfcTag.scanSecret.'
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
