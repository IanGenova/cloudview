-- AlterTable
ALTER TABLE `order` ADD COLUMN `guestMemberId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `userdashboardpermission` MODIFY `module` ENUM('OVERVIEW', 'HOTELS', 'HOTEL_GUIDE', 'ROOMS_LOCATIONS', 'NFC_TAGS', 'MENU', 'INVENTORY', 'ORDERS', 'KITCHEN_DISPLAY', 'SERVICES_MODULE', 'SERVICE_REQUESTS', 'POS_TERMINAL', 'ANALYTICS', 'HOTEL_SETTINGS', 'USER_ACCOUNT_SETTINGS', 'REWARDS') NOT NULL;

-- CreateTable
CREATE TABLE `GuestMember` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `birthDate` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GuestMember_hotelId_idx`(`hotelId`),
    INDEX `GuestMember_phone_idx`(`phone`),
    INDEX `GuestMember_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GuestPointAccount` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `guestMemberId` VARCHAR(191) NOT NULL,
    `availablePoints` INTEGER NOT NULL DEFAULT 0,
    `pendingPoints` INTEGER NOT NULL DEFAULT 0,
    `lifetimeEarnedPoints` INTEGER NOT NULL DEFAULT 0,
    `lifetimeRedeemedPoints` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GuestPointAccount_guestMemberId_key`(`guestMemberId`),
    INDEX `GuestPointAccount_hotelId_idx`(`hotelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GuestPointLedger` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `guestMemberId` VARCHAR(191) NOT NULL,
    `type` ENUM('EARNED', 'REDEEMED', 'ADJUSTED', 'VOIDED', 'EXPIRED', 'REFUNDED', 'BONUS') NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'VOIDED') NOT NULL DEFAULT 'CONFIRMED',
    `points` INTEGER NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `referenceId` VARCHAR(191) NULL,
    `description` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GuestPointLedger_hotelId_idx`(`hotelId`),
    INDEX `GuestPointLedger_guestMemberId_idx`(`guestMemberId`),
    INDEX `GuestPointLedger_source_idx`(`source`),
    INDEX `GuestPointLedger_referenceId_idx`(`referenceId`),
    UNIQUE INDEX `GuestPointLedger_hotelId_type_source_referenceId_key`(`hotelId`, `type`, `source`, `referenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reward` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `pointsCost` INTEGER NOT NULL,
    `rewardType` ENUM('DISCOUNT_AMOUNT', 'DISCOUNT_PERCENT', 'FREE_ITEM', 'CUSTOM') NOT NULL DEFAULT 'DISCOUNT_AMOUNT',
    `discountCents` INTEGER NULL,
    `discountPercent` INTEGER NULL,
    `freeProductId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `validFrom` DATETIME(3) NULL,
    `validUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Reward_hotelId_idx`(`hotelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RewardRedemption` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `guestMemberId` VARCHAR(191) NOT NULL,
    `rewardId` VARCHAR(191) NOT NULL,
    `pointsUsed` INTEGER NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `status` ENUM('RESERVED', 'USED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'RESERVED',
    `orderId` VARCHAR(191) NULL,
    `redeemedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `usedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RewardRedemption_code_key`(`code`),
    INDEX `RewardRedemption_hotelId_idx`(`hotelId`),
    INDEX `RewardRedemption_guestMemberId_idx`(`guestMemberId`),
    INDEX `RewardRedemption_rewardId_idx`(`rewardId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GuestPointSettings` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `spendCentsPerPoint` INTEGER NOT NULL DEFAULT 10000,
    `minimumSpendCents` INTEGER NOT NULL DEFAULT 0,
    `redemptionEnabled` BOOLEAN NOT NULL DEFAULT true,
    `pointsExpirationDays` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GuestPointSettings_hotelId_key`(`hotelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_guestMemberId_fkey` FOREIGN KEY (`guestMemberId`) REFERENCES `GuestMember`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuestMember` ADD CONSTRAINT `GuestMember_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuestPointAccount` ADD CONSTRAINT `GuestPointAccount_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuestPointAccount` ADD CONSTRAINT `GuestPointAccount_guestMemberId_fkey` FOREIGN KEY (`guestMemberId`) REFERENCES `GuestMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuestPointLedger` ADD CONSTRAINT `GuestPointLedger_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuestPointLedger` ADD CONSTRAINT `GuestPointLedger_guestMemberId_fkey` FOREIGN KEY (`guestMemberId`) REFERENCES `GuestMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuestPointLedger` ADD CONSTRAINT `GuestPointLedger_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reward` ADD CONSTRAINT `Reward_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardRedemption` ADD CONSTRAINT `RewardRedemption_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardRedemption` ADD CONSTRAINT `RewardRedemption_guestMemberId_fkey` FOREIGN KEY (`guestMemberId`) REFERENCES `GuestMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardRedemption` ADD CONSTRAINT `RewardRedemption_rewardId_fkey` FOREIGN KEY (`rewardId`) REFERENCES `Reward`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GuestPointSettings` ADD CONSTRAINT `GuestPointSettings_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
