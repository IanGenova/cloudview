import { DashboardModule } from '@prisma/client';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import { db } from '@/lib/db';
import { assertBackupHotelAccess } from '@/lib/backups/access';
import { readBackupArchive } from '@/lib/backups/storage';
import { recordBackupDownload } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      backupId: string;
    }>;
  }
) {
  const actor = await requireDashboardPermission(
    DashboardModule.HOTEL_SETTINGS,
    'canView'
  );
  const { backupId } = await params;

  const backup = await db.dataBackup.findUnique({
    where: { id: backupId },
  });

  if (!backup?.storagePath || !backup.filename) {
    return new Response('Backup file was not found.', {
      status: 404,
    });
  }

  assertBackupHotelAccess(actor, backup.hotelId);

  const buffer = await readBackupArchive(backup.storagePath);

  await recordBackupDownload({
    backupId: backup.id,
    userId: actor.id,
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(buffer.byteLength),
      'Content-Disposition': `attachment; filename="${backup.filename.replaceAll(
        '"',
        ''
      )}"`,
      'Cache-Control': 'no-store',
    },
  });
}
