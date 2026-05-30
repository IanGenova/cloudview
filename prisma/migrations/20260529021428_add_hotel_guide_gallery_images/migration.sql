-- AlterTable
ALTER TABLE `hotelguideitem` MODIFY `imageUrl` TEXT NULL;

-- AlterTable
ALTER TABLE `hotelguidesection` MODIFY `imageUrl` TEXT NULL;

-- CreateTable
CREATE TABLE `HotelGuideImage` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `sectionId` VARCHAR(191) NULL,
    `itemId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `caption` VARCHAR(191) NULL,
    `imageUrl` TEXT NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HotelGuideImage_hotelId_idx`(`hotelId`),
    INDEX `HotelGuideImage_sectionId_idx`(`sectionId`),
    INDEX `HotelGuideImage_itemId_idx`(`itemId`),
    INDEX `HotelGuideImage_isActive_idx`(`isActive`),
    INDEX `HotelGuideImage_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `HotelGuideImage` ADD CONSTRAINT `HotelGuideImage_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HotelGuideImage` ADD CONSTRAINT `HotelGuideImage_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `HotelGuideSection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HotelGuideImage` ADD CONSTRAINT `HotelGuideImage_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `HotelGuideItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
