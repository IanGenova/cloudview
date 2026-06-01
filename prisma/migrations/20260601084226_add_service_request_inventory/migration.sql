-- AlterTable
ALTER TABLE `servicecatalogitem` ADD COLUMN `inventoryTracked` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `ServiceAvailabilityStock` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `availableQty` INTEGER NOT NULL DEFAULT 0,
    `usedQty` INTEGER NOT NULL DEFAULT 0,
    `isSoldOut` BOOLEAN NOT NULL DEFAULT false,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ServiceAvailabilityStock_serviceId_key`(`serviceId`),
    INDEX `ServiceAvailabilityStock_hotelId_idx`(`hotelId`),
    INDEX `ServiceAvailabilityStock_serviceId_idx`(`serviceId`),
    INDEX `ServiceAvailabilityStock_isSoldOut_idx`(`isSoldOut`),
    UNIQUE INDEX `ServiceAvailabilityStock_hotelId_serviceId_key`(`hotelId`, `serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceAvailabilityMovement` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `serviceId` VARCHAR(191) NOT NULL,
    `stockId` VARCHAR(191) NOT NULL,
    `type` ENUM('SET_STOCK', 'ADD_STOCK', 'REMOVE_STOCK', 'SOLD_OUT', 'REOPEN', 'REQUEST_DEDUCTION', 'CANCEL_RESTORE') NOT NULL,
    `quantity` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `reason` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `serviceRequestId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ServiceAvailabilityMovement_hotelId_idx`(`hotelId`),
    INDEX `ServiceAvailabilityMovement_serviceId_idx`(`serviceId`),
    INDEX `ServiceAvailabilityMovement_stockId_idx`(`stockId`),
    INDEX `ServiceAvailabilityMovement_type_idx`(`type`),
    INDEX `ServiceAvailabilityMovement_serviceRequestId_idx`(`serviceRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ServiceAvailabilityStock` ADD CONSTRAINT `ServiceAvailabilityStock_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceAvailabilityStock` ADD CONSTRAINT `ServiceAvailabilityStock_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `ServiceCatalogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceAvailabilityMovement` ADD CONSTRAINT `ServiceAvailabilityMovement_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceAvailabilityMovement` ADD CONSTRAINT `ServiceAvailabilityMovement_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `ServiceCatalogItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceAvailabilityMovement` ADD CONSTRAINT `ServiceAvailabilityMovement_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `ServiceAvailabilityStock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
