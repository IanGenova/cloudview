-- CloudView Xendit provider cutover.
-- Existing PayMongo rows/tables are retained for historical compatibility;
-- Prisma maps the new Xendit model names to those physical tables.

ALTER TABLE `Order`
  MODIFY COLUMN `paymentMethod` ENUM('ROOM_CHARGE','PAY_AT_COUNTER','CASH','POS','PAYMONGO','XENDIT') NOT NULL DEFAULT 'ROOM_CHARGE';

ALTER TABLE `ServiceRequest`
  MODIFY COLUMN `paymentMethod` ENUM('ROOM_CHARGE','PAY_AT_COUNTER','CASH','POS','PAYMONGO','XENDIT') NULL;


-- Preserve the actual Xendit wallet category for ShopeePay, GrabPay, and future wallets.
ALTER TABLE `GuestStay`
  MODIFY COLUMN `checkoutPaymentMethod` ENUM('CASH','CARD','GCASH','MAYA','QRPH','EWALLET','BANK_TRANSFER','COMPANY_ACCOUNT','COMPLIMENTARY','WAIVED','PAY_LATER') NULL;

ALTER TABLE `GuestStayFolioPayment`
  MODIFY COLUMN `paymentMethod` ENUM('CASH','CARD','GCASH','MAYA','QRPH','EWALLET','BANK_TRANSFER','COMPANY_ACCOUNT','COMPLIMENTARY','WAIVED','PAY_LATER') NOT NULL;

ALTER TABLE `HotelSettings`
  ADD COLUMN `xenditSplitRuleId` VARCHAR(191) NULL,
  ADD COLUMN `xenditSplitRuleSignature` VARCHAR(64) NULL;

ALTER TABLE `GuestPayMongoSession`
  ADD COLUMN `xenditPaymentRequestId` VARCHAR(191) NULL,
  ADD INDEX `GuestPayMongoSession_xenditPaymentRequestId_idx` (`xenditPaymentRequestId`);

ALTER TABLE `PosPayMongoSession`
  ADD COLUMN `xenditPaymentRequestId` VARCHAR(191) NULL,
  ADD COLUMN `paymentSourceType` VARCHAR(80) NULL,
  ADD COLUMN `paidAmountCents` INTEGER NULL,
  ADD COLUMN `netAmountCents` INTEGER NULL,
  ADD COLUMN `feeCents` INTEGER NULL,
  ADD INDEX `PosPayMongoSession_xenditPaymentRequestId_idx` (`xenditPaymentRequestId`);

-- Reconcile asynchronous xenPlatform Split Payment results without changing the paid status.
ALTER TABLE `GuestPayMongoSession`
  ADD COLUMN `xenditSplitPaymentId` VARCHAR(191) NULL,
  ADD COLUMN `xenditSplitStatus` VARCHAR(32) NULL,
  ADD COLUMN `xenditSplitAmountCents` INTEGER NULL,
  ADD COLUMN `xenditSplitFailureCode` VARCHAR(191) NULL,
  ADD INDEX `GuestPayMongoSession_xenditSplitPaymentId_idx` (`xenditSplitPaymentId`);

ALTER TABLE `PosPayMongoSession`
  ADD COLUMN `xenditSplitPaymentId` VARCHAR(191) NULL,
  ADD COLUMN `xenditSplitStatus` VARCHAR(32) NULL,
  ADD COLUMN `xenditSplitAmountCents` INTEGER NULL,
  ADD COLUMN `xenditSplitFailureCode` VARCHAR(191) NULL,
  ADD INDEX `PosPayMongoSession_xenditSplitPaymentId_idx` (`xenditSplitPaymentId`);

-- Preserve existing PayMongo history while making all new rows Xendit-owned.
ALTER TABLE `GuestPayMongoSession`
  ADD COLUMN `paymentProvider` VARCHAR(20) NOT NULL DEFAULT 'PAYMONGO',
  ADD INDEX `GuestPayMongoSession_paymentProvider_status_idx` (`paymentProvider`, `status`);
ALTER TABLE `GuestPayMongoSession`
  MODIFY COLUMN `paymentProvider` VARCHAR(20) NOT NULL DEFAULT 'XENDIT';

ALTER TABLE `PosPayMongoSession`
  ADD COLUMN `paymentProvider` VARCHAR(20) NOT NULL DEFAULT 'PAYMONGO',
  ADD INDEX `PosPayMongoSession_paymentProvider_status_idx` (`paymentProvider`, `status`);
ALTER TABLE `PosPayMongoSession`
  MODIFY COLUMN `paymentProvider` VARCHAR(20) NOT NULL DEFAULT 'XENDIT';
