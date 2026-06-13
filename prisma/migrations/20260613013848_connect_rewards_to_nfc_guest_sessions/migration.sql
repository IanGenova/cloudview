-- AlterTable
ALTER TABLE `guestpointsettings` ADD COLUMN `nfcDailyMaxPoints` INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN `nfcOncePerTagPerDay` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `nfcTapPoints` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `serviceRequestCompletionPoints` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `serviceRequestDailyMaxPoints` INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE `nfcguestsession` ADD COLUMN `guestMemberId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `servicerequest` ADD COLUMN `guestMemberId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `NfcGuestSession_guestMemberId_idx` ON `NfcGuestSession`(`guestMemberId`);

-- CreateIndex
CREATE INDEX `ServiceRequest_guestMemberId_idx` ON `ServiceRequest`(`guestMemberId`);

-- AddForeignKey
ALTER TABLE `ServiceRequest` ADD CONSTRAINT `ServiceRequest_guestMemberId_fkey` FOREIGN KEY (`guestMemberId`) REFERENCES `GuestMember`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NfcGuestSession` ADD CONSTRAINT `NfcGuestSession_guestMemberId_fkey` FOREIGN KEY (`guestMemberId`) REFERENCES `GuestMember`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RedefineIndex
CREATE INDEX `Order_guestMemberId_idx` ON `Order`(`guestMemberId`);
DROP INDEX `Order_guestMemberId_fkey` ON `order`;
