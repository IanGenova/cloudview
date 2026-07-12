'use server';


import {
  DashboardModule,
  DataBackupType,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import { db } from '@/lib/db';
import {
  assertBackupHotelAccess,
  resolveBackupHotelId,
} from '@/lib/backups/access';
import {
  createHotelBackup,
  deleteStoredBackup,
  previewStoredBackup,
  restoreStoredFullBackup,
  verifyStoredBackup,
} from '@/lib/backups/service';

function text(formData: FormData, key: string) {
  return String(formData.get(key) || '').trim();
}

function actionError(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : 'The backup operation failed.';
}

export async function createBackupAction(formData: FormData) {
  try {
    const actor = await requireDashboardPermission(
      DashboardModule.HOTEL_SETTINGS,
      'canCreate'
    );
    const hotelId = resolveBackupHotelId(actor, text(formData, 'hotelId'));
    const rawType = text(formData, 'type');
    const type =
      rawType === DataBackupType.CONFIGURATION
        ? DataBackupType.CONFIGURATION
        : DataBackupType.FULL_HOTEL;

    const backup = await createHotelBackup({
      hotelId,
      createdById: actor.id,
      type,
    });

    revalidatePath('/dashboard/settings/backups');

    return {
      ok: true as const,
      backupId: backup.id,
      message: 'Backup created and verified successfully.',
    };
  } catch (error) {
    return {
      ok: false as const,
      error: actionError(error),
    };
  }
}

export async function verifyBackupAction(formData: FormData) {
  try {
    const actor = await requireDashboardPermission(
      DashboardModule.HOTEL_SETTINGS,
      'canEdit'
    );
    const backupId = text(formData, 'backupId');
    const backup = await db.dataBackup.findUnique({
      where: { id: backupId },
      select: { hotelId: true },
    });

    if (!backup) {
      throw new Error('Backup was not found.');
    }

    assertBackupHotelAccess(actor, backup.hotelId);

    await verifyStoredBackup({
      backupId,
      userId: actor.id,
    });

    revalidatePath('/dashboard/settings/backups');

    return {
      ok: true as const,
      message: 'Backup verification passed.',
    };
  } catch (error) {
    return {
      ok: false as const,
      error: actionError(error),
    };
  }
}

export async function previewBackupAction(formData: FormData) {
  try {
    const actor = await requireDashboardPermission(
      DashboardModule.HOTEL_SETTINGS,
      'canView'
    );
    const backupId = text(formData, 'backupId');
    const backup = await db.dataBackup.findUnique({
      where: { id: backupId },
      select: { hotelId: true },
    });

    if (!backup) {
      throw new Error('Backup was not found.');
    }

    assertBackupHotelAccess(actor, backup.hotelId);

    const preview = await previewStoredBackup({
      backupId,
      userId: actor.id,
    });

    revalidatePath('/dashboard/settings/backups');

    return {
      ok: true as const,
      preview,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: actionError(error),
    };
  }
}

export async function restoreBackupAction(formData: FormData) {
  try {
    const actor = await requireDashboardPermission(
      DashboardModule.HOTEL_SETTINGS,
      'canEdit'
    );
    const backupId = text(formData, 'backupId');
    const confirmation = text(formData, 'confirmation');

    if (confirmation !== 'RESTORE') {
      throw new Error('Type RESTORE exactly to confirm the operation.');
    }

    const backup = await db.dataBackup.findUnique({
      where: { id: backupId },
      select: { hotelId: true },
    });

    if (!backup) {
      throw new Error('Backup was not found.');
    }

    assertBackupHotelAccess(actor, backup.hotelId);

    const result = await restoreStoredFullBackup({
      backupId,
      userId: actor.id,
    });

    revalidatePath('/dashboard/settings/backups');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/orders');
    revalidatePath('/dashboard/inventory');
    revalidatePath('/dashboard/service-requests');

    return {
      ok: true as const,
      message:
        'Restore completed. Active guest sessions and stay passcodes were intentionally invalidated.',
      restoreId: result.restoreId,
      safetyBackupId: result.safetyBackupId,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: actionError(error),
    };
  }
}

export async function deleteBackupAction(formData: FormData) {
  try {
    const actor = await requireDashboardPermission(
      DashboardModule.HOTEL_SETTINGS,
      'canDelete'
    );
    const backupId = text(formData, 'backupId');
    const backup = await db.dataBackup.findUnique({
      where: { id: backupId },
      select: { hotelId: true },
    });

    if (!backup) {
      throw new Error('Backup was not found.');
    }

    assertBackupHotelAccess(actor, backup.hotelId);

    await deleteStoredBackup({
      backupId,
      userId: actor.id,
    });

    revalidatePath('/dashboard/settings/backups');

    return {
      ok: true as const,
      message: 'Backup deleted.',
    };
  } catch (error) {
    return {
      ok: false as const,
      error: actionError(error),
    };
  }
}
