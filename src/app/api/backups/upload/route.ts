import { NextResponse } from 'next/server';
import { DashboardModule } from '@prisma/client';
import { requireDashboardPermission } from '@/lib/dashboard-permissions';
import { resolveBackupHotelId } from '@/lib/backups/access';
import { registerUploadedBackup } from '@/lib/backups/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const actor = await requireDashboardPermission(
      DashboardModule.HOTEL_SETTINGS,
      'canCreate'
    );
    const formData = await request.formData();
    const hotelId = resolveBackupHotelId(
      actor,
      String(formData.get('hotelId') || '').trim()
    );
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'Please select a ZIP backup file.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const backup = await registerUploadedBackup({
      hotelId,
      userId: actor.id,
      originalFilename: file.name,
      buffer,
    });

    return NextResponse.json({
      ok: true,
      backupId: backup.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to upload backup.',
      },
      { status: 400 }
    );
  }
}
