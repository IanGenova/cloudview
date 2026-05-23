-- AlterTable
ALTER TABLE `location` ADD COLUMN `deletedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `room` ADD COLUMN `deletedAt` DATETIME(3) NULL;
