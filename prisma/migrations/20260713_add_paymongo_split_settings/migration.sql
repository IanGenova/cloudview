-- Add PayMongo Linked Accounts split-payment settings per hotel.
-- Percentage commission values are stored in basis points (1000 = 10%).
-- Fixed commission values are stored in centavos (1000 = PHP 10.00).
ALTER TABLE `HotelSettings`
    ADD COLUMN `paymongoSplitEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `paymongoLinkedAccountId` VARCHAR(191) NULL,
    ADD COLUMN `paymongoCommissionType` VARCHAR(32) NOT NULL DEFAULT 'PERCENTAGE_NET',
    ADD COLUMN `paymongoCommissionValue` INTEGER NOT NULL DEFAULT 1000,
    ADD COLUMN `paymongoFeeBearer` VARCHAR(32) NOT NULL DEFAULT 'HOTEL';
