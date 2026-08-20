-- Link stock movements to the order that caused them.
--
-- Reconciliation previously matched related movements by substring-searching
-- the free-text `reason` column, so a copy change could silently break the
-- double-restore guard. These columns give the guards a real key.
--
-- Nullable: movements recorded before this migration cannot be backfilled, and
-- manual stock adjustments legitimately have no order. The application falls
-- back to the legacy `reason` match when `orderId` is NULL.
ALTER TABLE `MenuAvailabilityMovement`
    ADD COLUMN `orderId` VARCHAR(191) NULL,
    ADD COLUMN `orderItemId` VARCHAR(191) NULL;

CREATE INDEX `MenuAvailabilityMovement_orderId_idx` ON `MenuAvailabilityMovement`(`orderId`);
CREATE INDEX `MenuAvailabilityMovement_orderItemId_idx` ON `MenuAvailabilityMovement`(`orderItemId`);
