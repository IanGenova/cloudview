/**
 * What a backup restore is allowed to do to a user account.
 *
 * The archive is not authenticated. `readAndVerifyBackupZip` verifies
 * checksums.json against the files shipped beside it inside the same zip, and
 * whoever uploads the zip writes both, so every value in it is attacker
 * -controlled input. Restore used to take `role` from it directly, which let a
 * HOTEL_ADMIN -- the default permission set grants HOTEL_SETTINGS, which gates
 * upload and restore alike -- ship a users module naming their own email with
 * "role": "SUPER_ADMIN", and hold the whole estate after a sign-out.
 *
 * Two rules, kept in one tested place because the fix is a single word in a
 * large function and would be easy to lose in a later edit.
 */

const ROLES_RESTORABLE_FOR_A_NEW_USER = new Set([
  'STAFF',
  'KITCHEN',
  'HOTEL_ADMIN',
]);

const LEAST_PRIVILEGE = 'STAFF';

export function resolveRestoredUserRole(params: {
  /** The role the account already holds, or null when the restore creates it. */
  existingRole: string | null;
  /** Whatever the archive claims. Unvalidated, untrusted, any shape. */
  archiveRole: unknown;
}) {
  /*
   * An account that already exists keeps the role it already has. Changing
   * roles is the Users screen's job, and that screen authorises the change
   * against the actor. A restore has no equivalent check and no actor context
   * at this point, so it declines to have an opinion.
   *
   * This also covers the demotion direction: an archive cannot strip an
   * existing SUPER_ADMIN, which would otherwise be a denial-of-service on the
   * one account that can undo the damage.
   */
  if (existingRoleIsKnown(params.existingRole)) {
    return params.existingRole as string;
  }

  /*
   * A new account is created inactive, so a person still has to enable it.
   * STAFF, KITCHEN and HOTEL_ADMIN are all within the gift of whoever is
   * running the restore, so honouring them is not an escalation.
   *
   * SUPER_ADMIN is not. It spans every hotel, and a hotel-scoped archive has
   * no standing to grant it. Anything unrecognised lands here too, which is
   * why this is an allowlist of exact strings rather than a check for the one
   * value we happen to fear -- no trimming, no case folding, no coercion.
   */
  if (
    typeof params.archiveRole === 'string' &&
    ROLES_RESTORABLE_FOR_A_NEW_USER.has(params.archiveRole)
  ) {
    return params.archiveRole;
  }

  return LEAST_PRIVILEGE;
}

function existingRoleIsKnown(role: string | null): role is string {
  return typeof role === 'string' && role.length > 0;
}
