import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { isNextRedirectError } from '@/lib/next-control-flow';
import {
  buildCentrifugoSubscriptionTokens,
  createCentrifugoConnectionToken,
} from '@/lib/realtime/centrifugo-token';
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

export async function GET() {
  try {
    const user = await requireUser();

    const channels =
      user.role === Role.SUPER_ADMIN
        ? [realtimeChannels.kitchenGlobal()]
        : user.hotelId
          ? [realtimeChannels.kitchen(user.hotelId)]
          : [];

    if (!channels.length) {
      return noStoreJson(
        {
          error: 'No hotel access found.',
        },
        {
          status: 403,
        }
      );
    }

    const subject = `dashboard:${user.id}:kitchen`;

    const token = createCentrifugoConnectionToken({
      subject,
      ttlSeconds: 60 * 60,
    });

    return noStoreJson({
      token,
      channels,
      subscriptionTokens: buildCentrifugoSubscriptionTokens({
        subject,
        channels,
        ttlSeconds: 60 * 60,
      }),
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
              centrifugoWsUrl:
                process.env.NEXT_PUBLIC_CENTRIFUGO_WS_URL ?? null,
            },
    });
  } catch (error) {
    /*
      requireUser() enforces auth by calling redirect(), which Next implements
      as a thrown control-flow signal. Swallowing it here would turn an
      unauthenticated request into a misleading HTTP 500 instead of sending the
      caller to the login page.
    */
    if (isNextRedirectError(error)) {
      throw error;
    }

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