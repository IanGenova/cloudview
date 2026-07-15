ALTER TABLE `NfcGuestSession`
  ADD COLUMN `roomVerificationFailures` INTEGER NOT NULL DEFAULT 0 AFTER `endedAt`,
  ADD COLUMN `roomVerificationLockedUntil` DATETIME(3) NULL AFTER `roomVerificationFailures`,
  ADD COLUMN `lastRoomVerificationAt` DATETIME(3) NULL AFTER `roomVerificationLockedUntil`;
