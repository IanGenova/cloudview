const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'src', 'lib', 'guest-service-order.ts');

if (!fs.existsSync(target)) {
  console.error(`File not found: ${target}`);
  console.error('Run this script from the CloudView project root.');
  process.exit(1);
}

const original = fs.readFileSync(target, 'utf8');

const exactBefore = `        const completed = await tx.guestXenditSession.updateMany({
          where: {
            id: xenditSessionId,
            status: GuestXenditStatus.PROCESSING,
            serviceRequests: { none: {} },
          },
          data: {
            status: GuestXenditStatus.COMPLETED,`;

const exactAfter = `        const completed = await tx.guestXenditSession.updateMany({
          where: {
            id: xenditSessionId,
            status: GuestXenditStatus.PROCESSING,
          },
          data: {
            status: GuestXenditStatus.COMPLETED,`;

let updated = original;

if (updated.includes(exactBefore)) {
  updated = updated.replace(exactBefore, exactAfter);
} else {
  updated = updated.replace(
    /const completed = await tx\.guestXenditSession\.updateMany\(\{\s*where:\s*\{\s*id:\s*xenditSessionId,\s*status:\s*GuestXenditStatus\.PROCESSING,\s*serviceRequests:\s*\{\s*none:\s*\{\}\s*\},\s*\},\s*data:\s*\{\s*status:\s*GuestXenditStatus\.COMPLETED,/m,
    `const completed = await tx.guestXenditSession.updateMany({
          where: {
            id: xenditSessionId,
            status: GuestXenditStatus.PROCESSING,
          },
          data: {
            status: GuestXenditStatus.COMPLETED,`
  );
}

if (updated === original) {
  if (
    original.includes('status: GuestXenditStatus.PROCESSING') &&
    !original.includes('serviceRequests: { none: {} }')
  ) {
    console.log('guest-service-order.ts already appears to be patched.');
    process.exit(0);
  }

  console.error('Could not find the exact Xendit service completion block to patch.');
  console.error('Open src/lib/guest-service-order.ts and remove only this line from the completion updateMany where block:');
  console.error('  serviceRequests: { none: {} },');
  process.exit(1);
}

const backup = `${target}.backup-${Date.now()}`;
fs.writeFileSync(backup, original, 'utf8');
fs.writeFileSync(target, updated, 'utf8');

console.log('Patched src/lib/guest-service-order.ts successfully.');
console.log(`Backup created: ${backup}`);
console.log('');
console.log('Next run:');
console.log('  npx tsc --noEmit');
