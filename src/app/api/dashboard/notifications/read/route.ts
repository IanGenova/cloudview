import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getNotificationScope } from '@/lib/dashboard-notifications';

export async function POST(request: Request) {
  const user = await requireUser();

  const body = (await request.json().catch(() => null)) as {
    ids?: string[];
    all?: boolean;
  } | null;

  const now = new Date();

  if (body?.all) {
    await db.dashboardNotification.updateMany({
      where: {
        isRead: false,
        ...getNotificationScope(user),
      },
      data: {
        isRead: true,
        readAt: now,
      },
    });

    return NextResponse.json({
      ok: true,
    });
  }

  const ids = body?.ids?.filter(Boolean) ?? [];

  if (!ids.length) {
    return NextResponse.json({
      ok: true,
    });
  }

  await db.dashboardNotification.updateMany({
    where: {
      id: {
        in: ids,
      },
      isRead: false,
      ...getNotificationScope(user),
    },
    data: {
      isRead: true,
      readAt: now,
    },
  });

  return NextResponse.json({
    ok: true,
  });
}