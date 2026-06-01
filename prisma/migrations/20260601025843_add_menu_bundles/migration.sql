-- AlterTable
ALTER TABLE `menuavailabilitymovement` MODIFY `type` ENUM('SET_STOCK', 'ADD_STOCK', 'REMOVE_STOCK', 'SOLD_OUT', 'REOPEN', 'ORDER_DEDUCTION', 'CANCEL_RESTORE', 'BUNDLE_ORDER_DEDUCTION', 'BUNDLE_CANCEL_RESTORE') NOT NULL;

-- AlterTable
ALTER TABLE `menuproduct` ADD COLUMN `productType` ENUM('SINGLE', 'BUNDLE') NOT NULL DEFAULT 'SINGLE';

-- AlterTable
ALTER TABLE `orderitem` ADD COLUMN `isBundleSnapshot` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `MenuBundleComponent` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `bundleProductId` VARCHAR(191) NOT NULL,
    `componentProductId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MenuBundleComponent_hotelId_idx`(`hotelId`),
    INDEX `MenuBundleComponent_bundleProductId_idx`(`bundleProductId`),
    INDEX `MenuBundleComponent_componentProductId_idx`(`componentProductId`),
    UNIQUE INDEX `MenuBundleComponent_bundleProductId_componentProductId_key`(`bundleProductId`, `componentProductId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItemBundleComponent` (
    `id` VARCHAR(191) NOT NULL,
    `orderItemId` VARCHAR(191) NOT NULL,
    `bundleProductId` VARCHAR(191) NULL,
    `componentProductId` VARCHAR(191) NULL,
    `componentNameSnapshot` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrderItemBundleComponent_orderItemId_idx`(`orderItemId`),
    INDEX `OrderItemBundleComponent_bundleProductId_idx`(`bundleProductId`),
    INDEX `OrderItemBundleComponent_componentProductId_idx`(`componentProductId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `MenuProduct_productType_idx` ON `MenuProduct`(`productType`);

-- CreateIndex
CREATE INDEX `OrderItem_isBundleSnapshot_idx` ON `OrderItem`(`isBundleSnapshot`);

-- AddForeignKey
ALTER TABLE `MenuBundleComponent` ADD CONSTRAINT `MenuBundleComponent_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuBundleComponent` ADD CONSTRAINT `MenuBundleComponent_bundleProductId_fkey` FOREIGN KEY (`bundleProductId`) REFERENCES `MenuProduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MenuBundleComponent` ADD CONSTRAINT `MenuBundleComponent_componentProductId_fkey` FOREIGN KEY (`componentProductId`) REFERENCES `MenuProduct`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItemBundleComponent` ADD CONSTRAINT `OrderItemBundleComponent_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItemBundleComponent` ADD CONSTRAINT `OrderItemBundleComponent_bundleProductId_fkey` FOREIGN KEY (`bundleProductId`) REFERENCES `MenuProduct`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItemBundleComponent` ADD CONSTRAINT `OrderItemBundleComponent_componentProductId_fkey` FOREIGN KEY (`componentProductId`) REFERENCES `MenuProduct`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
