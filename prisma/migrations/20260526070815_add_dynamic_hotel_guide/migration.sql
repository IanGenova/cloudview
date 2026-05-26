-- CreateTable
CREATE TABLE `HotelGuideSection` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `subtitle` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `imageUrl` VARCHAR(191) NULL,
    `iconKey` VARCHAR(191) NOT NULL DEFAULT 'Info',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HotelGuideSection_hotelId_idx`(`hotelId`),
    INDEX `HotelGuideSection_isActive_idx`(`isActive`),
    INDEX `HotelGuideSection_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HotelGuideItem` (
    `id` VARCHAR(191) NOT NULL,
    `sectionId` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `subtitle` VARCHAR(191) NULL,
    `content` VARCHAR(191) NULL,
    `itemType` ENUM('INFORMATION', 'QUICK_ACTION', 'POLICY', 'CONTACT', 'LOCATION', 'FACILITY', 'DINING', 'TRANSPORTATION', 'FAQ') NOT NULL DEFAULT 'INFORMATION',
    `imageUrl` VARCHAR(191) NULL,
    `iconKey` VARCHAR(191) NOT NULL DEFAULT 'Info',
    `hours` VARCHAR(191) NULL,
    `location` VARCHAR(191) NULL,
    `contact` VARCHAR(191) NULL,
    `mapUrl` VARCHAR(191) NULL,
    `buttonLabel` VARCHAR(191) NULL,
    `buttonHref` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HotelGuideItem_hotelId_idx`(`hotelId`),
    INDEX `HotelGuideItem_sectionId_idx`(`sectionId`),
    INDEX `HotelGuideItem_itemType_idx`(`itemType`),
    INDEX `HotelGuideItem_isActive_idx`(`isActive`),
    INDEX `HotelGuideItem_sortOrder_idx`(`sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `HotelGuideSection` ADD CONSTRAINT `HotelGuideSection_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HotelGuideItem` ADD CONSTRAINT `HotelGuideItem_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HotelGuideItem` ADD CONSTRAINT `HotelGuideItem_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `HotelGuideSection`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
