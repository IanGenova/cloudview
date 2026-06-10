import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { createCentrifugoConnectionToken } from '@/lib/realtime/centrifugo-token';

export const dynamic = 'force-dynamic';

function getChannelsForUser(user: {
  id: string;
  role: Role;
  hotelId: string | null;
}) {
  if (user.role === Role.SUPER_ADMIN) {
    return ['dashboard:global:inventory', 'dashboard:global:orders'];
  }

  if (!user.hotelId) {
    return [];
  }

  return [
    `dashboard:hotel:${user.hotelId}:inventory`,
    `dashboard:hotel:${user.hotelId}:orders`,
  ];
}

export async function GET() {
  const user = await requireUser();
  const channels = getChannelsForUser(user);

  if (!channels.length) {
    return NextResponse.json(
      {
        error: 'No realtime operations channel access found.',
      },
      {
        status: 403,
      }
    );
  }

  const token = createCentrifugoConnectionToken({
    subject: `dashboard-operations:${user.id}`,
    ttlSeconds: 60 * 60,
  });

  return NextResponse.json({
    token,
    channels,
  });
}