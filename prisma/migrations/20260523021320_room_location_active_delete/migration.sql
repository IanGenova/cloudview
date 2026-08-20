-- AlterTable
ALTER TABLE `Location` ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Room` ADD COLUMN `deletedAt` DATETIME(3) NULL;
