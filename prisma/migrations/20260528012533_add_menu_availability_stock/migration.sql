-- CreateTable
CREATE TABLE `MenuAvailabilityStock` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `availableQty` INTEGER NOT NULL DEFAULT 0,
    `soldQty` INTEGER NOT NULL DEFAULT 0,
    `isSoldOut` BOOLEAN NOT NULL DEFAULT false,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MenuAvailabilityStock_hotelId_idx`(`hotelId`),
    INDEX `MenuAvailabilityStock_productId_idx`(`productId`),
    INDEX `MenuAvailabilityStock_isSoldOut_idx`(`isSoldOut`),
    UNIQUE INDEX `MenuAvailabilityStock_hotelId_productId_key`(`hotelId`, `productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MenuAvailabilityMovement` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `stockId` VARCHAR(191) NOT NULL,
    `type` ENUM('SET_STOCK', 'ADD_STOCK', 'REMOVE_STOCK', 'SOLD_OUT', 'REOPEN', 'ORDER_DEDUCTION', 'CANCEL_RESTORE') NOT NULL,
    `quantity` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `reason` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MenuAvailabilityMovement_hotelId_idx`(`hotelId`),
    INDEX `MenuAvailabilityMovement_productId_idx`(`productId`),
    INDEX `MenuAvailabilityMovement_stockId_idx`(`stockId`),
    INDEX `MenuAvailabilityMovement_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MenuAvailabilityStock` ADD CONSTRAINT `MenuAvailabilityStock_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuAvailabilityStock` ADD CONSTRAINT `MenuAvailabilityStock_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `MenuProduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuAvailabilityMovement` ADD CONSTRAINT `MenuAvailabilityMovement_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuAvailabilityMovement` ADD CONSTRAINT `MenuAvailabilityMovement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `MenuProduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuAvailabilityMovement` ADD CONSTRAINT `MenuAvailabilityMovement_stockId_fkey` FOREIGN KEY (`stockId`) REFERENCES `MenuAvailabilityStock`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
