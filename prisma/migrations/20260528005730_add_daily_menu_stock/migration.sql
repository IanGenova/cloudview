-- CreateTable
CREATE TABLE `MenuDailyStock` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `stockDate` DATETIME(3) NOT NULL,
    `openingQty` INTEGER NOT NULL DEFAULT 0,
    `availableQty` INTEGER NOT NULL DEFAULT 0,
    `soldQty` INTEGER NOT NULL DEFAULT 0,
    `isSoldOut` BOOLEAN NOT NULL DEFAULT false,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MenuDailyStock_hotelId_idx`(`hotelId`),
    INDEX `MenuDailyStock_productId_idx`(`productId`),
    INDEX `MenuDailyStock_stockDate_idx`(`stockDate`),
    INDEX `MenuDailyStock_isSoldOut_idx`(`isSoldOut`),
    UNIQUE INDEX `MenuDailyStock_hotelId_productId_stockDate_key`(`hotelId`, `productId`, `stockDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MenuDailyStockMovement` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `stockId` VARCHAR(191) NOT NULL,
    `stockDate` DATETIME(3) NOT NULL,
    `type` ENUM('SET_OPENING', 'ADD', 'REMOVE', 'SALE', 'CANCEL_RESTORE', 'SOLD_OUT', 'REOPEN') NOT NULL,
    `quantity` INTEGER NOT NULL,
    `reason` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MenuDailyStockMovement_hotelId_idx`(`hotelId`),
    INDEX `MenuDailyStockMovement_productId_idx`(`productId`),
    INDEX `MenuDailyStockMovement_stockId_idx`(`stockId`),
    INDEX `MenuDailyStockMovement_stockDate_idx`(`stockDate`),
    INDEX `MenuDailyStockMovement_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MenuDailyStock` ADD CONSTRAINT `MenuDailyStock_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuDailyStock` ADD CONSTRAINT `MenuDailyStock_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `MenuProduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuDailyStockMovement` ADD CONSTRAINT `MenuDailyStockMovement_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuDailyStockMovement` ADD CONSTRAINT `MenuDailyStockMovement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `MenuProduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuDailyStockMovement` ADD CONSTRAINT `MenuDailyStockMovement_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `MenuDailyStock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
