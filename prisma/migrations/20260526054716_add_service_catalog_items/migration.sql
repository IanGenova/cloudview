-- CreateTable
CREATE TABLE `ServiceCatalogItem` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `iconKey` VARCHAR(191) NOT NULL DEFAULT 'ConciergeBell',
    `billingMode` ENUM('FREE', 'FIXED_PRICE', 'PRICE_ON_CONFIRMATION') NOT NULL DEFAULT 'FREE',
    `unitPrice` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `unitLabel` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ServiceCatalogItem_hotelId_idx`(`hotelId`),
    INDEX `ServiceCatalogItem_category_idx`(`category`),
    INDEX `ServiceCatalogItem_isActive_idx`(`isActive`),
    UNIQUE INDEX `ServiceCatalogItem_hotelId_code_key`(`hotelId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ServiceCatalogItem` ADD CONSTRAINT `ServiceCatalogItem_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
