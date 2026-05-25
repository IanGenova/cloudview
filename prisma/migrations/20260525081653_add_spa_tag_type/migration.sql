/*
  Warnings:

  - The values [ROOM] on the enum `NfcTag_tagType` will be removed. If these variants are still used in the database, this will fail.
  - The values [ROOM] on the enum `NfcTag_tagType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `location` MODIFY `type` ENUM('POOL', 'RESTAURANT', 'LOBBY', 'AMENITY', 'SPA', 'PARKING', 'GYM', 'BAR', 'OTHER') NOT NULL;

-- AlterTable
ALTER TABLE `nfctag` MODIFY `tagType` ENUM('POOL', 'RESTAURANT', 'LOBBY', 'AMENITY', 'SPA', 'PARKING', 'GYM', 'BAR', 'OTHER') NOT NULL;
