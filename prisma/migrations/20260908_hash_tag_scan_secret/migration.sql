-- Store the NFC scan secret as a hash, plus an encrypted copy for re-display.
--
-- The plaintext `scanSecret` column stays for now so tags keep working between
-- this migration and the backfill (scripts/backfill-tag-secret-storage.mjs).
-- Drop it with the follow-up migration once the backfill reports zero remaining.
--
-- Table and column names are CamelCase deliberately: MySQL on Linux is
-- case-sensitive, and lowercase identifiers here have broken this deployment
-- before.
ALTER TABLE `NfcTag`
    ADD COLUMN `scanSecretHash` VARCHAR(191) NULL,
    ADD COLUMN `scanSecretCipher` TEXT NULL;

CREATE UNIQUE INDEX `NfcTag_scanSecretHash_key` ON `NfcTag`(`scanSecretHash`);
