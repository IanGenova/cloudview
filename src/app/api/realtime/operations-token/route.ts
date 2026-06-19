import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { createCentrifugoConnectionToken } from '@/lib/realtime/centrifugo-token';
import { realtimeChannels } from '@/lib/realtime/channels';

export const dynamic = 'force-dynamic';

function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);

  response.headers.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');

  return response;
}

function getChannelsForUser(user: {
  id: string;
  role: Role;
  hotelId: string | null;
}) {
  if (user.role === Role.SUPER_ADMIN) {
    return [
      realtimeChannels.dashboardGlobalInventory(),
      realtimeChannels.dashboardGlobalOrders(),
    ];
  }

  if (!user.hotelId) {
    return [];
  }

  return [
    realtimeChannels.dashboardHotelInventory(user.hotelId),
    realtimeChannels.dashboardHotelOrders(user.hotelId),
  ];
}

export async function GET() {
  try {
    const user = await requireUser();
    const channels = getChannelsForUser(user);

    if (!channels.length) {
      return noStoreJson(
        {
          error: 'No realtime operations channel access found.',
        },
        {
          status: 403,
        }
      );
    }

    const subject = `dashboard:${user.id}:operations`;

    const token = createCentrifugoConnectionToken({
      subject,
      ttlSeconds: 60 * 60,
    });

    return noStoreJson({
      token,
      channels: Array.from(new Set(channels)),
      debug:
        process.env.NODE_ENV === 'production'
          ? undefined
          : {
              subject,
              userId: user.id,
              role: user.role,
              hotelId: user.hotelId,
              channels,
              issuedAt: new Date().toISOString(),
              tokenSecretConfigured: Boolean(
                process.env.CENTRIFUGO_TOKEN_HMAC_SECRET
              ),
            },
    });
  } catch (error) {
    console.error('Operations realtime token route failed:', error);

    return noStoreJson(
      {
        error: 'Unable to create operations realtime token.',
        detail:
          process.env.NODE_ENV === 'production'
            ? undefined
            : error instanceof Error
              ? error.message
              : String(error),
      },
      {
        status: 500,
      }
    );
  }
}