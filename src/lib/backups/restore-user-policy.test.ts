import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRestoredUserRole } from './restore-user-policy';

/*
 * What role a backup restore is allowed to write.
 *
 * The archive is attacker-controlled. `readAndVerifyBackupZip` checks
 * checksums.json against the files shipped beside it in the same zip, and the
 * uploader controls both, so nothing about the contents is authenticated.
 * Restore then took `role` straight out of it.
 *
 * The concrete attack: a HOTEL_ADMIN -- who holds HOTEL_SETTINGS by default,
 * which is what gates both upload and restore -- ships a users module
 * containing one row, their own email, "role": "SUPER_ADMIN". Restore matched
 * by email and wrote it. They signed out, signed back in, and held every hotel
 * in the estate.
 *
 * Two rules close it, and both are here because both are easy to erode later:
 *
 *   A restore never changes an existing user's role. Role changes belong to
 *   the Users screen, which authorises them.
 *
 *   A restore never mints a SUPER_ADMIN. That role is estate-wide; a
 *   hotel-scoped archive has no standing to grant it.
 */

test('an existing user keeps their role no matter what the archive claims', () => {
  for (const claimed of ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF', 'KITCHEN']) {
    assert.equal(
      resolveRestoredUserRole({ existingRole: 'STAFF', archiveRole: claimed }),
      'STAFF',
      `an archive claiming ${claimed} must not move a STAFF user`
    );
  }
});

test('the escalation that motivated this is refused', () => {
  assert.equal(
    resolveRestoredUserRole({
      existingRole: 'HOTEL_ADMIN',
      archiveRole: 'SUPER_ADMIN',
    }),
    'HOTEL_ADMIN'
  );
});

test('a restore cannot demote an existing super admin either', () => {
  assert.equal(
    resolveRestoredUserRole({
      existingRole: 'SUPER_ADMIN',
      archiveRole: 'STAFF',
    }),
    'SUPER_ADMIN'
  );
});

/*
 * A new user is created inactive, so a person still has to turn the account on
 * before it can do anything. STAFF, KITCHEN and HOTEL_ADMIN are all within the
 * gift of whoever is running the restore, so restoring them is not escalation.
 */
test('a new user may be restored as staff, kitchen or hotel admin', () => {
  for (const claimed of ['STAFF', 'KITCHEN', 'HOTEL_ADMIN']) {
    assert.equal(
      resolveRestoredUserRole({ existingRole: null, archiveRole: claimed }),
      claimed
    );
  }
});

test('a new user is never created as a super admin', () => {
  assert.equal(
    resolveRestoredUserRole({ existingRole: null, archiveRole: 'SUPER_ADMIN' }),
    'STAFF'
  );
});

test('an unrecognised or missing role falls back to the least privilege', () => {
  for (const claimed of ['', 'ADMIN', 'root', null, undefined, 42, {}, []]) {
    assert.equal(
      resolveRestoredUserRole({ existingRole: null, archiveRole: claimed }),
      'STAFF',
      `${JSON.stringify(claimed)} must not become a role`
    );
  }
});

test('case and whitespace do not smuggle a role past the check', () => {
  for (const claimed of ['super_admin', ' SUPER_ADMIN ', 'Super_Admin']) {
    assert.equal(
      resolveRestoredUserRole({ existingRole: null, archiveRole: claimed }),
      'STAFF',
      `${JSON.stringify(claimed)} must not become SUPER_ADMIN`
    );
  }
});
