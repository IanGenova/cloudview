/*
  Warnings:

  - A unique constraint covering the columns `[scanSecret]` on the table `NfcTag` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `nfctag` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `lastScannedAt` DATETIME(3) NULL,
    ADD COLUMN `scanSecret` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `NfcAccessSession` (
    `id` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `userAgentHash` VARCHAR(191) NULL,
    `ipHash` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `NfcAccessSession_tokenHash_key`(`tokenHash`),
    INDEX `NfcAccessSession_tagId_idx`(`tagId`),
    INDEX `NfcAccessSession_hotelId_idx`(`hotelId`),
    INDEX `NfcAccessSession_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `NfcTag_scanSecret_key` ON `NfcTag`(`scanSecret`);

-- AddForeignKey
ALTER TABLE `NfcAccessSession` ADD CONSTRAINT `NfcAccessSession_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `NfcTag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NfcAccessSession` ADD CONSTRAINT `NfcAccessSession_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
