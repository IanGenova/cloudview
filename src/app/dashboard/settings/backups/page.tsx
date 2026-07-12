import { DashboardModule, Role } from '@prisma/client';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import { db } from '@/lib/db';
import { BackupManagerClient } from './BackupManagerClient';

export const dynamic = 'force-dynamic';

export default async function BackupSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    hotelId?: string;
  }>;
}) {
  const actor = await requireDashboardPermission(
    DashboardModule.HOTEL_SETTINGS,
    'canView'
  );
  const params = await searchParams;

  const hotels =
    actor.role === Role.SUPER_ADMIN
      ? await db.hotel.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            slug: true,
          },
          orderBy: { name: 'asc' },
        })
      : await db.hotel.findMany({
          where: {
            id: actor.hotelId || '__missing__',
          },
          select: {
            id: true,
            name: true,
            slug: true,
          },
        });

  const selectedHotelId =
    actor.role === Role.SUPER_ADMIN
      ? params?.hotelId || hotels[0]?.id || ''
      : actor.hotelId || '';

  const [backups, restores] = selectedHotelId
    ? await Promise.all([
        db.dataBackup.findMany({
          where: {
            hotelId: selectedHotelId,
            status: {
              not: 'DELETED',
            },
          },
          include: {
            createdBy: {
              select: {
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 100,
        }),
        db.dataRestore.findMany({
          where: {
            targetHotelId: selectedHotelId,
          },
          include: {
            backup: {
              select: {
                filename: true,
                type: true,
              },
            },
            startedBy: {
              select: {
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 30,
        }),
      ])
    : [[], []];

  return (
    <div>
      <PageHeader
        title="Data Backup & Recovery"
        description="Create, download, verify, upload, preview, and restore hotel data from inside CloudView."
      />

      <BackupManagerClient
        isSuperAdmin={actor.role === Role.SUPER_ADMIN}
        hotels={hotels}
        selectedHotelId={selectedHotelId}
        backups={backups.map((backup) => ({
          id: backup.id,
          type: backup.type,
          status: backup.status,
          filename: backup.filename || '',
          fileSizeBytes: backup.fileSizeBytes?.toString() || '0',
          checksum: backup.checksum || '',
          backupVersion: backup.backupVersion,
          schemaVersion: backup.schemaVersion,
          recordCounts:
            backup.recordCounts &&
            typeof backup.recordCounts === 'object' &&
            !Array.isArray(backup.recordCounts)
              ? (backup.recordCounts as Record<string, number>)
              : {},
          errorMessage: backup.errorMessage || '',
          startedAt: backup.startedAt?.toISOString() || '',
          completedAt: backup.completedAt?.toISOString() || '',
          createdAt: backup.createdAt.toISOString(),
          createdBy:
            backup.createdBy?.name ||
            backup.createdBy?.email ||
            'System',
        }))}
        restores={restores.map((restore) => ({
          id: restore.id,
          backupFilename: restore.backup.filename || 'Backup',
          backupType: restore.backup.type,
          mode: restore.mode,
          status: restore.status,
          currentPhase: restore.currentPhase || '',
          errorMessage: restore.errorMessage || '',
          createdAt: restore.createdAt.toISOString(),
          completedAt: restore.completedAt?.toISOString() || '',
          startedBy:
            restore.startedBy?.name ||
            restore.startedBy?.email ||
            'System',
          safetyBackupId: restore.safetyBackupId || '',
        }))}
      />
    </div>
  );
}
