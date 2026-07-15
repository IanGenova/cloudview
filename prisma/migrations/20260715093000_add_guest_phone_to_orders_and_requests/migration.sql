ALTER TABLE `Order`
  ADD COLUMN `guestPhone` VARCHAR(40) NULL AFTER `guestName`;

ALTER TABLE `ServiceRequest`
  ADD COLUMN `guestPhone` VARCHAR(40) NULL AFTER `guestName`;
