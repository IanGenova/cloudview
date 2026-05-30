-- AlterTable
ALTER TABLE `order` ADD COLUMN `guestSessionId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `servicerequest` ADD COLUMN `guestSessionId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `NfcGuestSession` (
    `id` VARCHAR(191) NOT NULL,
    `sessionKey` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NULL,
    `locationId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,

    UNIQUE INDEX `NfcGuestSession_sessionKey_key`(`sessionKey`),
    INDEX `NfcGuestSession_hotelId_idx`(`hotelId`),
    INDEX `NfcGuestSession_tagId_idx`(`tagId`),
    INDEX `NfcGuestSession_roomId_idx`(`roomId`),
    INDEX `NfcGuestSession_locationId_idx`(`locationId`),
    INDEX `NfcGuestSession_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Order_guestSessionId_idx` ON `Order`(`guestSessionId`);

-- CreateIndex
CREATE INDEX `ServiceRequest_guestSessionId_idx` ON `ServiceRequest`(`guestSessionId`);

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_guestSessionId_fkey` FOREIGN KEY (`guestSessionId`) REFERENCES `NfcGuestSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceRequest` ADD CONSTRAINT `ServiceRequest_guestSessionId_fkey` FOREIGN KEY (`guestSessionId`) REFERENCES `NfcGuestSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NfcGuestSession` ADD CONSTRAINT `NfcGuestSession_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NfcGuestSession` ADD CONSTRAINT `NfcGuestSession_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `NfcTag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NfcGuestSession` ADD CONSTRAINT `NfcGuestSession_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NfcGuestSession` ADD CONSTRAINT `NfcGuestSession_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
