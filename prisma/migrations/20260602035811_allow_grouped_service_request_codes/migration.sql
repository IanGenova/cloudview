-- DropIndex
DROP INDEX `ServiceRequest_requestCode_key` ON `servicerequest`;

-- CreateIndex
CREATE INDEX `ServiceRequest_requestCode_idx` ON `ServiceRequest`(`requestCode`);

-- CreateIndex
CREATE INDEX `ServiceRequest_hotelId_requestCode_idx` ON `ServiceRequest`(`hotelId`, `requestCode`);
