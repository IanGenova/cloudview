-- CreateTable
CREATE TABLE `DataBackup` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `type` ENUM('FULL_HOTEL', 'CONFIGURATION', 'PRE_RESTORE') NOT NULL,
    `status` ENUM('QUEUED', 'CREATING', 'READY', 'VERIFYING', 'VALID', 'CORRUPTED', 'FAILED', 'RESTORING', 'RESTORED', 'DELETED') NOT NULL DEFAULT 'QUEUED',
    `filename` VARCHAR(255) NULL,
    `storagePath` TEXT NULL,
    `fileSizeBytes` BIGINT NULL,
    `checksum` VARCHAR(64) NULL,
    `backupVersion` INTEGER NOT NULL DEFAULT 1,
    `schemaVersion` VARCHAR(64) NOT NULL,
    `selectedModules` JSON NULL,
    `recordCounts` JSON NULL,
    `manifest` JSON NULL,
    `errorMessage` TEXT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DataBackup_hotelId_createdAt_idx`(`hotelId`, `createdAt`),
    INDEX `DataBackup_status_idx`(`status`),
    INDEX `DataBackup_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataRestore` (
    `id` VARCHAR(191) NOT NULL,
    `backupId` VARCHAR(191) NOT NULL,
    `targetHotelId` VARCHAR(191) NOT NULL,
    `startedById` VARCHAR(191) NULL,
    `mode` ENUM('PREVIEW', 'FULL_RESTORE') NOT NULL,
    `status` ENUM('QUEUED', 'CREATING', 'READY', 'VERIFYING', 'VALID', 'CORRUPTED', 'FAILED', 'RESTORING', 'RESTORED', 'DELETED') NOT NULL DEFAULT 'QUEUED',
    `selectedModules` JSON NULL,
    `previewSummary` JSON NULL,
    `restoredCounts` JSON NULL,
    `currentPhase` VARCHAR(120) NULL,
    `errorMessage` TEXT NULL,
    `safetyBackupId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DataRestore_backupId_idx`(`backupId`),
    INDEX `DataRestore_targetHotelId_createdAt_idx`(`targetHotelId`, `createdAt`),
    INDEX `DataRestore_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataBackupAudit` (
    `id` VARCHAR(191) NOT NULL,
    `backupId` VARCHAR(191) NULL,
    `restoreId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `action` ENUM('BACKUP_CREATED', 'BACKUP_UPLOADED', 'BACKUP_DOWNLOADED', 'BACKUP_VERIFIED', 'BACKUP_DELETED', 'RESTORE_PREVIEWED', 'RESTORE_STARTED', 'RESTORE_COMPLETED', 'RESTORE_FAILED') NOT NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DataBackupAudit_backupId_idx`(`backupId`),
    INDEX `DataBackupAudit_restoreId_idx`(`restoreId`),
    INDEX `DataBackupAudit_userId_idx`(`userId`),
    INDEX `DataBackupAudit_action_idx`(`action`),
    INDEX `DataBackupAudit_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DataBackup`
ADD CONSTRAINT `DataBackup_hotelId_fkey`
FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`)
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataBackup`
ADD CONSTRAINT `DataBackup_createdById_fkey`
FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRestore`
ADD CONSTRAINT `DataRestore_backupId_fkey`
FOREIGN KEY (`backupId`) REFERENCES `DataBackup`(`id`)
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRestore`
ADD CONSTRAINT `DataRestore_safetyBackupId_fkey`
FOREIGN KEY (`safetyBackupId`) REFERENCES `DataBackup`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRestore`
ADD CONSTRAINT `DataRestore_targetHotelId_fkey`
FOREIGN KEY (`targetHotelId`) REFERENCES `Hotel`(`id`)
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRestore`
ADD CONSTRAINT `DataRestore_startedById_fkey`
FOREIGN KEY (`startedById`) REFERENCES `User`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataBackupAudit`
ADD CONSTRAINT `DataBackupAudit_backupId_fkey`
FOREIGN KEY (`backupId`) REFERENCES `DataBackup`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataBackupAudit`
ADD CONSTRAINT `DataBackupAudit_restoreId_fkey`
FOREIGN KEY (`restoreId`) REFERENCES `DataRestore`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataBackupAudit`
ADD CONSTRAINT `DataBackupAudit_userId_fkey`
FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
ON DELETE SET NULL ON UPDATE CASCADE;
