import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { createCentrifugoConnectionToken } from '@/lib/realtime/centrifugo-token';
import { realtimeChannels } from '@/lib/realtime/channels';

export const dynamic = 'force-dynamic';

function jsonError(message: string, status: number) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
    }
  );
}

export async function GET() {
  const user = await requireUser();

  const channels =
    user.role === Role.SUPER_ADMIN
      ? [realtimeChannels.inventoryGlobal()]
      : user.hotelId
        ? [realtimeChannels.inventory(user.hotelId)]
        : [];

  if (!channels.length) {
    return jsonError('No hotel access found.', 403);
  }

  const token = createCentrifugoConnectionToken({
    subject: `dashboard:${user.id}:inventory`,
    ttlSeconds: 60 * 60,
  });

  return NextResponse.json({
    token,
    channels,
  });
}