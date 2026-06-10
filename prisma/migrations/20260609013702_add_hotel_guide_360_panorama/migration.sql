-- AlterTable
ALTER TABLE `hotelguideitem` ADD COLUMN `panoramaEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `panoramaImageUrl` TEXT NULL;

-- AlterTable
ALTER TABLE `hotelguidesection` ADD COLUMN `panoramaEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `panoramaImageUrl` TEXT NULL;
