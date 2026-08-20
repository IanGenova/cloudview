-- AlterTable
ALTER TABLE `HotelGuideItem` ADD COLUMN `panoramaEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `panoramaImageUrl` TEXT NULL;

-- AlterTable
ALTER TABLE `HotelGuideSection` ADD COLUMN `panoramaEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `panoramaImageUrl` TEXT NULL;
