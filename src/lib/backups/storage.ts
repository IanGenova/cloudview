import path from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';

function storageRoot() {
  return path.resolve(
    process.env.BACKUP_STORAGE_DIR?.trim() ||
      path.join(process.cwd(), 'storage', 'backups')
  );
}

function assertInsideStorage(candidate: string) {
  const root = storageRoot();
  const resolved = path.resolve(candidate);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('Unsafe backup storage path.');
  }

  return resolved;
}

export async function ensureHotelBackupDirectory(hotelId: string) {
  const directory = assertInsideStorage(path.join(storageRoot(), hotelId));
  await mkdir(directory, { recursive: true });
  return directory;
}

export async function writeBackupArchive(input: {
  hotelId: string;
  filename: string;
  buffer: Buffer;
}) {
  const directory = await ensureHotelBackupDirectory(input.hotelId);
  const outputPath = assertInsideStorage(
    path.join(directory, path.basename(input.filename))
  );

  await writeFile(outputPath, input.buffer);

  return outputPath;
}

export async function readBackupArchive(storagePath: string) {
  return readFile(assertInsideStorage(storagePath));
}

export async function deleteBackupArchive(storagePath: string) {
  await rm(assertInsideStorage(storagePath), { force: true });
}

export function safeBackupFilename(value: string) {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!sanitized) {
    throw new Error('Backup filename is invalid.');
  }

  return sanitized.endsWith('.zip') ? sanitized : `${sanitized}.zip`;
}
