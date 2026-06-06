-- CreateTable
CREATE TABLE `UserDashboardPermission` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `module` ENUM('OVERVIEW', 'HOTELS', 'HOTEL_GUIDE', 'ROOMS_LOCATIONS', 'NFC_TAGS', 'MENU', 'INVENTORY', 'ORDERS', 'KITCHEN_DISPLAY', 'SERVICES_MODULE', 'SERVICE_REQUESTS', 'POS_TERMINAL', 'ANALYTICS', 'HOTEL_SETTINGS', 'USER_ACCOUNT_SETTINGS') NOT NULL,
    `canView` BOOLEAN NOT NULL DEFAULT false,
    `canCreate` BOOLEAN NOT NULL DEFAULT false,
    `canEdit` BOOLEAN NOT NULL DEFAULT false,
    `canDelete` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserDashboardPermission_userId_idx`(`userId`),
    INDEX `UserDashboardPermission_module_idx`(`module`),
    UNIQUE INDEX `UserDashboardPermission_userId_module_key`(`userId`, `module`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserDashboardPermission` ADD CONSTRAINT `UserDashboardPermission_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
