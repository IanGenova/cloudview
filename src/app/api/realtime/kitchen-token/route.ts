import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { createCentrifugoConnectionToken } from '@/lib/realtime/centrifugo-token';

export const dynamic = 'force-dynamic';

function getKitchenChannel(hotelId: string) {
  return `kitchen-${hotelId}`;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

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

export async function GET() {
  try {
    const user = await requireUser();

    const hotels =
      user.role === 'SUPER_ADMIN'
        ? await db.hotel.findMany({
            select: {
              id: true,
            },
          })
        : user.hotelId
          ? [
              {
                id: user.hotelId,
              },
            ]
          : [];

    const hotelIds = uniqueStrings(hotels.map((hotel) => hotel.id));

    if (!hotelIds.length) {
      return noStoreJson(
        {
          error: 'No hotel access found.',
        },
        {
          status: 403,
        }
      );
    }

    const subject = `dashboard:${user.id}`;
    const channels = hotelIds.map(getKitchenChannel);

    const token = createCentrifugoConnectionToken({
      subject,
      ttlSeconds: 60 * 60,
    });

    return noStoreJson({
      token,
      channels,
      debug:
        process.env.NODE_ENV === 'production'
          ? undefined
          : {
              subject,
              userId: user.id,
              role: user.role,
              hotelIds,
              channels,
              issuedAt: new Date().toISOString(),
              tokenSecretConfigured: Boolean(
                process.env.CENTRIFUGO_TOKEN_HMAC_SECRET
              ),
              centrifugoWsUrl:
                process.env.NEXT_PUBLIC_CENTRIFUGO_WS_URL ?? null,
            },
    });
  } catch (error) {
    console.error('Kitchen realtime token route failed:', error);

    return noStoreJson(
      {
        error: 'Unable to create kitchen realtime token.',
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