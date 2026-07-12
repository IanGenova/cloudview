import {
  DataBackupAuditAction,
  DataBackupStatus,
  DataBackupType,
  DataRestoreMode,
  Prisma,
} from '@prisma/client';
import { db } from '@/lib/db';
import { createBackupZip, readAndVerifyBackupZip } from './archive';
import { sha256Buffer } from './checksum';
import { exportHotelBackup } from './exporter';
import { performFullHotelRestore } from './restore';
import {
  deleteBackupArchive,
  readBackupArchive,
  safeBackupFilename,
  writeBackupArchive,
} from './storage';
import {
  CLOUDVIEW_BACKUP_SCHEMA_VERSION,
  modulesForBackupType,
  type BackupModule,
} from './types';

function backupTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replaceAll(':', '')
    .replaceAll('-', '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function filenameForBackup(input: {
  hotelSlug: string;
  type: DataBackupType;
}) {
  return safeBackupFilename(
    `cloudview-${input.hotelSlug}-${input.type.toLowerCase()}-${backupTimestamp()}`
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : 'Unexpected backup operation error.';
}

export async function createHotelBackup(input: {
  hotelId: string;
  createdById: string | null;
  type: DataBackupType;
  modules?: BackupModule[];
}) {
  const hotel = await db.hotel.findUnique({
    where: { id: input.hotelId },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });

  if (!hotel) {
    throw new Error('Hotel was not found.');
  }

  const selectedModules =
    input.modules?.length
      ? input.modules
      : modulesForBackupType(input.type);

  const backup = await db.dataBackup.create({
    data: {
      hotelId: hotel.id,
      createdById: input.createdById,
      type: input.type,
      status: DataBackupStatus.CREATING,
      backupVersion: 1,
      schemaVersion: CLOUDVIEW_BACKUP_SCHEMA_VERSION,
      selectedModules: selectedModules as unknown as Prisma.InputJsonValue,
      startedAt: new Date(),
    },
  });

  try {
    const exported = await exportHotelBackup({
      hotelId: hotel.id,
      createdByUserId: input.createdById,
      backupType: input.type,
      modules: selectedModules,
    });

    const buffer = await createBackupZip({
      manifest: exported.manifest,
      modules: exported.modules,
    });
    const filename = filenameForBackup({
      hotelSlug: hotel.slug,
      type: input.type,
    });
    const storagePath = await writeBackupArchive({
      hotelId: hotel.id,
      filename: `${backup.id}-${filename}`,
      buffer,
    });
    const checksum = sha256Buffer(buffer);

    const completed = await db.dataBackup.update({
      where: { id: backup.id },
      data: {
        status: DataBackupStatus.VALID,
        filename,
        storagePath,
        fileSizeBytes: BigInt(buffer.byteLength),
        checksum,
        recordCounts:
          exported.recordCounts as unknown as Prisma.InputJsonValue,
        manifest: exported.manifest as unknown as Prisma.InputJsonValue,
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    await db.dataBackupAudit.create({
      data: {
        backupId: backup.id,
        userId: input.createdById,
        action: DataBackupAuditAction.BACKUP_CREATED,
        details: {
          type: input.type,
          modules: selectedModules,
          checksum,
          sizeBytes: buffer.byteLength,
        },
      },
    });

    return completed;
  } catch (error) {
    await db.dataBackup.update({
      where: { id: backup.id },
      data: {
        status: DataBackupStatus.FAILED,
        errorMessage: errorMessage(error).slice(0, 5000),
        completedAt: new Date(),
      },
    });

    throw error;
  }
}

export async function verifyStoredBackup(input: {
  backupId: string;
  userId: string | null;
}) {
  const backup = await db.dataBackup.findUnique({
    where: { id: input.backupId },
  });

  if (!backup?.storagePath) {
    throw new Error('Backup file was not found.');
  }

  await db.dataBackup.update({
    where: { id: backup.id },
    data: { status: DataBackupStatus.VERIFYING },
  });

  try {
    const buffer = await readBackupArchive(backup.storagePath);
    const archiveChecksum = sha256Buffer(buffer);

    if (backup.checksum && backup.checksum !== archiveChecksum) {
      throw new Error('Backup archive checksum does not match.');
    }

    const archive = await readAndVerifyBackupZip(buffer);

    if (archive.manifest.hotelId !== backup.hotelId) {
      throw new Error('Backup hotel identity does not match its record.');
    }

    await db.dataBackup.update({
      where: { id: backup.id },
      data: {
        status: DataBackupStatus.VALID,
        checksum: archiveChecksum,
        manifest: archive.manifest as unknown as Prisma.InputJsonValue,
        recordCounts:
          archive.manifest.recordCounts as unknown as Prisma.InputJsonValue,
        errorMessage: null,
      },
    });

    await db.dataBackupAudit.create({
      data: {
        backupId: backup.id,
        userId: input.userId,
        action: DataBackupAuditAction.BACKUP_VERIFIED,
        details: {
          checksum: archiveChecksum,
          modules: archive.manifest.modules,
        },
      },
    });

    return archive.manifest;
  } catch (error) {
    await db.dataBackup.update({
      where: { id: backup.id },
      data: {
        status: DataBackupStatus.CORRUPTED,
        errorMessage: errorMessage(error).slice(0, 5000),
      },
    });

    throw error;
  }
}

export async function registerUploadedBackup(input: {
  hotelId: string;
  userId: string | null;
  originalFilename: string;
  buffer: Buffer;
}) {
  const maxUploadBytes =
    Number(process.env.BACKUP_MAX_UPLOAD_MB || 100) * 1024 * 1024;

  if (input.buffer.byteLength <= 0) {
    throw new Error('The uploaded backup file is empty.');
  }

  if (input.buffer.byteLength > maxUploadBytes) {
    throw new Error('The uploaded backup exceeds the configured size limit.');
  }

  const archive = await readAndVerifyBackupZip(input.buffer);

  if (archive.manifest.hotelId !== input.hotelId) {
    throw new Error(
      'The uploaded backup belongs to a different hotel.'
    );
  }

  const checksum = sha256Buffer(input.buffer);
  const backup = await db.dataBackup.create({
    data: {
      hotelId: input.hotelId,
      createdById: input.userId,
      type: archive.manifest.backupType,
      status: DataBackupStatus.VALID,
      filename: safeBackupFilename(input.originalFilename),
      fileSizeBytes: BigInt(input.buffer.byteLength),
      checksum,
      backupVersion: archive.manifest.backupVersion,
      schemaVersion: archive.manifest.schemaVersion,
      selectedModules:
        archive.manifest.modules as unknown as Prisma.InputJsonValue,
      recordCounts:
        archive.manifest.recordCounts as unknown as Prisma.InputJsonValue,
      manifest: archive.manifest as unknown as Prisma.InputJsonValue,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  const storagePath = await writeBackupArchive({
    hotelId: input.hotelId,
    filename: `${backup.id}-${safeBackupFilename(input.originalFilename)}`,
    buffer: input.buffer,
  });

  const updated = await db.dataBackup.update({
    where: { id: backup.id },
    data: {
      storagePath,
      filename: safeBackupFilename(input.originalFilename),
    },
  });

  await db.dataBackupAudit.create({
    data: {
      backupId: backup.id,
      userId: input.userId,
      action: DataBackupAuditAction.BACKUP_UPLOADED,
      details: {
        originalFilename: input.originalFilename,
        checksum,
        sizeBytes: input.buffer.byteLength,
      },
    },
  });

  return updated;
}

export async function previewStoredBackup(input: {
  backupId: string;
  userId: string | null;
}) {
  const backup = await db.dataBackup.findUnique({
    where: { id: input.backupId },
  });

  if (!backup?.storagePath) {
    throw new Error('Backup file was not found.');
  }

  const buffer = await readBackupArchive(backup.storagePath);
  const archive = await readAndVerifyBackupZip(buffer);
  const current = await exportHotelBackup({
    hotelId: backup.hotelId,
    createdByUserId: input.userId,
    backupType: backup.type,
    modules: archive.manifest.modules,
  });

  const keys = new Set([
    ...Object.keys(archive.manifest.recordCounts),
    ...Object.keys(current.recordCounts),
  ]);

  const modules = Array.from(keys)
    .sort()
    .map((key) => {
      const backupCount = archive.manifest.recordCounts[key] ?? 0;
      const currentCount = current.recordCounts[key] ?? 0;

      return {
        key,
        backupCount,
        currentCount,
        difference: backupCount - currentCount,
      };
    });

  const summary = {
    hotelId: archive.manifest.hotelId,
    hotelName: archive.manifest.hotelName,
    backupType: archive.manifest.backupType,
    createdAt: archive.manifest.createdAt,
    schemaVersion: archive.manifest.schemaVersion,
    modules,
  };

  const restore = await db.dataRestore.create({
    data: {
      backupId: backup.id,
      targetHotelId: backup.hotelId,
      startedById: input.userId,
      mode: DataRestoreMode.PREVIEW,
      status: DataBackupStatus.VALID,
      selectedModules:
        archive.manifest.modules as unknown as Prisma.InputJsonValue,
      previewSummary: summary as unknown as Prisma.InputJsonValue,
      startedAt: new Date(),
      completedAt: new Date(),
      currentPhase: 'Preview complete',
    },
  });

  await db.dataBackupAudit.create({
    data: {
      backupId: backup.id,
      restoreId: restore.id,
      userId: input.userId,
      action: DataBackupAuditAction.RESTORE_PREVIEWED,
      details: summary as unknown as Prisma.InputJsonValue,
    },
  });

  return summary;
}

export async function restoreStoredFullBackup(input: {
  backupId: string;
  userId: string | null;
}) {
  const backup = await db.dataBackup.findUnique({
    where: { id: input.backupId },
  });

  if (!backup?.storagePath) {
    throw new Error('Backup file was not found.');
  }

  if (
    backup.type !== DataBackupType.FULL_HOTEL &&
    backup.type !== DataBackupType.PRE_RESTORE
  ) {
    throw new Error(
      'Only full hotel and pre-restore backups can run a full restore.'
    );
  }

  const buffer = await readBackupArchive(backup.storagePath);
  const archive = await readAndVerifyBackupZip(buffer);

  if (archive.manifest.hotelId !== backup.hotelId) {
    throw new Error('Backup hotel identity does not match.');
  }

  const safetyBackup = await createHotelBackup({
    hotelId: backup.hotelId,
    createdById: input.userId,
    type: DataBackupType.PRE_RESTORE,
  });

  const restore = await db.dataRestore.create({
    data: {
      backupId: backup.id,
      targetHotelId: backup.hotelId,
      startedById: input.userId,
      mode: DataRestoreMode.FULL_RESTORE,
      status: DataBackupStatus.RESTORING,
      selectedModules:
        archive.manifest.modules as unknown as Prisma.InputJsonValue,
      safetyBackupId: safetyBackup.id,
      startedAt: new Date(),
      currentPhase: 'Starting restore',
    },
  });

  await db.dataBackup.update({
    where: { id: backup.id },
    data: { status: DataBackupStatus.RESTORING },
  });

  await db.dataBackupAudit.create({
    data: {
      backupId: backup.id,
      restoreId: restore.id,
      userId: input.userId,
      action: DataBackupAuditAction.RESTORE_STARTED,
      details: {
        safetyBackupId: safetyBackup.id,
      },
    },
  });

  try {
    const restoredCounts = await performFullHotelRestore({
      restoreId: restore.id,
      targetHotelId: backup.hotelId,
      archive,
    });

    await db.dataRestore.update({
      where: { id: restore.id },
      data: {
        status: DataBackupStatus.RESTORED,
        restoredCounts:
          restoredCounts as unknown as Prisma.InputJsonValue,
        currentPhase: 'Restore complete',
        completedAt: new Date(),
        errorMessage: null,
      },
    });

    await db.dataBackup.update({
      where: { id: backup.id },
      data: { status: DataBackupStatus.VALID },
    });

    await db.dataBackupAudit.create({
      data: {
        backupId: backup.id,
        restoreId: restore.id,
        userId: input.userId,
        action: DataBackupAuditAction.RESTORE_COMPLETED,
        details: {
          safetyBackupId: safetyBackup.id,
          restoredCounts,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      restoreId: restore.id,
      safetyBackupId: safetyBackup.id,
      restoredCounts,
    };
  } catch (error) {
    await db.dataRestore.update({
      where: { id: restore.id },
      data: {
        status: DataBackupStatus.FAILED,
        errorMessage: errorMessage(error).slice(0, 5000),
        completedAt: new Date(),
      },
    });

    await db.dataBackup.update({
      where: { id: backup.id },
      data: { status: DataBackupStatus.VALID },
    });

    await db.dataBackupAudit.create({
      data: {
        backupId: backup.id,
        restoreId: restore.id,
        userId: input.userId,
        action: DataBackupAuditAction.RESTORE_FAILED,
        details: {
          safetyBackupId: safetyBackup.id,
          error: errorMessage(error),
        },
      },
    });

    throw error;
  }
}

export async function deleteStoredBackup(input: {
  backupId: string;
  userId: string | null;
}) {
  const backup = await db.dataBackup.findUnique({
    where: { id: input.backupId },
    include: {
      sourceRestores: {
        where: {
          status: DataBackupStatus.RESTORING,
        },
        select: {
          id: true,
        },
      },
      safetyForRestores: {
        where: {
          status: DataBackupStatus.RESTORING,
        },
        select: {
          id: true,
        },
      },
    },
  });

  if (!backup) {
    throw new Error('Backup was not found.');
  }

  if (backup.sourceRestores.length || backup.safetyForRestores.length) {
    throw new Error('A backup used by an active restore cannot be deleted.');
  }

  if (backup.storagePath) {
    await deleteBackupArchive(backup.storagePath);
  }

  await db.dataBackupAudit.create({
    data: {
      backupId: backup.id,
      userId: input.userId,
      action: DataBackupAuditAction.BACKUP_DELETED,
      details: {
        filename: backup.filename,
      },
    },
  });

  await db.dataBackup.update({
    where: { id: backup.id },
    data: {
      status: DataBackupStatus.DELETED,
      storagePath: null,
      errorMessage: null,
    },
  });
}

export async function recordBackupDownload(input: {
  backupId: string;
  userId: string | null;
}) {
  await db.dataBackupAudit.create({
    data: {
      backupId: input.backupId,
      userId: input.userId,
      action: DataBackupAuditAction.BACKUP_DOWNLOADED,
    },
  });
}
