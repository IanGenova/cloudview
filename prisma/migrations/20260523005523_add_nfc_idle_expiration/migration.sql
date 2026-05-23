-- AlterTable
ALTER TABLE `nfcaccesssession` ADD COLUMN `idleExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `lastSeenAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `NfcAccessSession_idleExpiresAt_idx` ON `NfcAccessSession`(`idleExpiresAt`);
