-- CreateTable
CREATE TABLE `RoomAddOnCharge` (
    `id` VARCHAR(191) NOT NULL,
    `chargeCode` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `serviceRequestId` VARCHAR(191) NOT NULL,
    `itemName` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitPrice` DECIMAL(10, 2) NOT NULL,
    `totalAmount` DECIMAL(10, 2) NOT NULL,
    `postedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RoomAddOnCharge_chargeCode_key`(`chargeCode`),
    UNIQUE INDEX `RoomAddOnCharge_serviceRequestId_key`(`serviceRequestId`),
    INDEX `RoomAddOnCharge_hotelId_idx`(`hotelId`),
    INDEX `RoomAddOnCharge_roomId_idx`(`roomId`),
    INDEX `RoomAddOnCharge_serviceRequestId_idx`(`serviceRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
