import { createHash } from 'node:crypto';

export function sha256Buffer(value: Buffer | Uint8Array | string) {
  return createHash('sha256').update(value).digest('hex');
}
