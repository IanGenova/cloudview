import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { createCentrifugoConnectionToken } from '@/lib/realtime/centrifugo-token';

export const dynamic = 'force-dynamic';

export async function GET() {
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

  const hotelIds = hotels.map((hotel) => hotel.id);

  if (!hotelIds.length) {
    return NextResponse.json(
      {
        error: 'No hotel access found.',
      },
      {
        status: 403,
      }
    );
  }

  const token = createCentrifugoConnectionToken({
    subject: `dashboard:${user.id}`,
    ttlSeconds: 60 * 60,
  });

  return NextResponse.json({
    token,
    channels: hotelIds.map((hotelId) => `kitchen-${hotelId}`),
  });
}