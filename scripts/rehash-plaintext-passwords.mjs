/**
 * Migrate plain-text password rows to bcrypt.
 *
 * `verifyPassword()` now refuses any credential that is not a bcrypt hash, so
 * accounts whose `passwordHash` column still holds a plain-text value can no
 * longer sign in. This script converts those rows in place: the stored value is
 * hashed with the same cost factor used by `hashPassword()`, so the existing
 * password keeps working while it stops being readable in the database.
 *
 * Usage, from the project root:
 *
 *   node --env-file=.env scripts/rehash-plaintext-passwords.mjs          # report only
 *   node --env-file=.env scripts/rehash-plaintext-passwords.mjs --apply  # write changes
 *
 * Run the report first. Take a database backup before running with --apply.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;
const WEAK_PASSWORD_MAX_LENGTH = 7;

const apply = process.argv.includes('--apply');
const prisma = new PrismaClient();

function isBcryptHash(value) {
  return BCRYPT_PATTERN.test(String(value ?? ''));
}

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      passwordHash: true,
    },
  });

  const plaintextUsers = users.filter((user) => !isBcryptHash(user.passwordHash));

  console.log(`Scanned ${users.length} account(s).`);
  console.log(`Found ${plaintextUsers.length} with a non-bcrypt password.\n`);

  if (plaintextUsers.length === 0) {
    console.log('Nothing to migrate. All stored credentials are bcrypt hashes.');
    return;
  }

  for (const user of plaintextUsers) {
    const storedLength = String(user.passwordHash ?? '').length;
    const weak = storedLength <= WEAK_PASSWORD_MAX_LENGTH;

    console.log(
      `  ${user.email}  role=${user.role}  active=${user.isActive}  ` +
        `storedLength=${storedLength}${weak ? '  <-- WEAK, reset this one after migrating' : ''}`
    );
  }

  if (!apply) {
    console.log(
      '\nReport only. Re-run with --apply to hash these values in place.'
    );
    console.log(
      'Passwords are NOT printed by this script and are not changed by the migration —'
    );
    console.log('each account keeps signing in with the password it already has.');
    return;
  }

  let migrated = 0;

  for (const user of plaintextUsers) {
    const currentPassword = String(user.passwordHash ?? '').trim();

    if (!currentPassword) {
      console.warn(`  Skipped ${user.email}: empty password column.`);
      continue;
    }

    const hashed = await bcrypt.hash(currentPassword, BCRYPT_ROUNDS);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashed },
    });

    migrated += 1;
    console.log(`  Migrated ${user.email}`);
  }

  console.log(`\nMigrated ${migrated} account(s) to bcrypt.`);
  console.log(
    'Any account flagged WEAK above should now be given a strong password through'
  );
  console.log('Dashboard -> Settings -> User Account Settings.');
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
