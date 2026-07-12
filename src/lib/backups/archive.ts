import JSZip from 'jszip';
import {
  BACKUP_MODULES,
  CLOUDVIEW_BACKUP_VERSION,
  type BackupArchiveContent,
  type BackupManifest,
  isBackupModule,
  moduleFilename,
} from './types';
import { parseJsonObject, stableStringify } from './serialization';
import { sha256Buffer } from './checksum';

const MAX_ARCHIVE_FILES = 32;
const MAX_UNCOMPRESSED_BYTES =
  Number(process.env.BACKUP_MAX_UNCOMPRESSED_MB || 250) * 1024 * 1024;

export async function createBackupZip(input: {
  manifest: BackupManifest;
  modules: BackupArchiveContent['modules'];
}) {
  const zip = new JSZip();
  const checksums: Record<string, string> = {};

  for (const module of input.manifest.modules) {
    const filename = moduleFilename(module);
    const json = stableStringify(input.modules[module] ?? {});
    checksums[filename] = sha256Buffer(json);
    zip.file(filename, json);
  }

  const manifestJson = stableStringify(input.manifest);
  checksums['manifest.json'] = sha256Buffer(manifestJson);

  zip.file('manifest.json', manifestJson);
  zip.file('checksums.json', stableStringify(checksums));

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6,
    },
  });
}

export async function readAndVerifyBackupZip(
  buffer: Buffer
): Promise<BackupArchiveContent> {
  const zip = await JSZip.loadAsync(buffer, {
    checkCRC32: true,
  });

  const files = Object.values(zip.files).filter((file) => !file.dir);

  if (files.length > MAX_ARCHIVE_FILES) {
    throw new Error('Backup archive contains too many files.');
  }

  const allowedFiles = new Set([
    'manifest.json',
    'checksums.json',
    ...BACKUP_MODULES.map((module) => moduleFilename(module)),
  ]);

  for (const file of files) {
    if (!allowedFiles.has(file.name)) {
      throw new Error(`Unexpected file in backup archive: ${file.name}`);
    }
  }

  const manifestEntry = zip.file('manifest.json');
  const checksumsEntry = zip.file('checksums.json');

  if (!manifestEntry || !checksumsEntry) {
    throw new Error('Backup archive is missing its manifest or checksums.');
  }

  const manifestText = await manifestEntry.async('string');
  const checksumsText = await checksumsEntry.async('string');

  const manifest = parseJsonObject<BackupManifest>(
    manifestText,
    'Backup manifest'
  );
  const checksums = parseJsonObject<Record<string, string>>(
    checksumsText,
    'Backup checksums'
  );

  validateManifest(manifest);

  if (checksums['manifest.json'] !== sha256Buffer(manifestText)) {
    throw new Error('Backup manifest checksum does not match.');
  }

  let uncompressedBytes =
    Buffer.byteLength(manifestText) + Buffer.byteLength(checksumsText);

  const modules: BackupArchiveContent['modules'] = {};

  for (const module of manifest.modules) {
    const filename = moduleFilename(module);
    const entry = zip.file(filename);

    if (!entry) {
      throw new Error(`Backup module file is missing: ${filename}`);
    }

    const text = await entry.async('string');
    uncompressedBytes += Buffer.byteLength(text);

    if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error('Backup archive exceeds the configured safety limit.');
    }

    const expectedChecksum = checksums[filename];

    if (!expectedChecksum || expectedChecksum !== sha256Buffer(text)) {
      throw new Error(`Checksum failed for ${filename}.`);
    }

    modules[module] = parseJsonObject<Record<string, unknown>>(
      text,
      filename
    );
  }

  return {
    manifest,
    checksums,
    modules,
  };
}

function validateManifest(manifest: BackupManifest) {
  if (manifest.application !== 'CloudView') {
    throw new Error('This archive is not a CloudView backup.');
  }

  if (manifest.backupVersion !== CLOUDVIEW_BACKUP_VERSION) {
    throw new Error(
      `Unsupported backup version: ${manifest.backupVersion}.`
    );
  }

  if (!manifest.hotelId || !manifest.hotelName || !manifest.hotelSlug) {
    throw new Error('Backup manifest hotel information is incomplete.');
  }

  if (!Array.isArray(manifest.modules) || !manifest.modules.length) {
    throw new Error('Backup manifest does not contain any modules.');
  }

  for (const module of manifest.modules) {
    if (!isBackupModule(module)) {
      throw new Error(`Unsupported backup module: ${String(module)}`);
    }
  }
}
