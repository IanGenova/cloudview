import { NextResponse } from 'next/server';
import {
  createCentrifugoConnectionToken,
  createCentrifugoSubscriptionToken,
} from '@/lib/realtime/centrifugo-token';

/**
 * Build the realtime handshake payload for a caller.
 *
 * `channels` is the list this caller is actually entitled to, resolved
 * server-side from their session/hotel scope. For each one we mint a
 * per-channel subscription token so Centrifugo can enforce that scope itself
 * — the channel list alone is only a hint the client could ignore.
 */
export function createRealtimeTokenResponse(params: {
  subject: string;
  channels: string[];
  ttlSeconds?: number;
}) {
  const uniqueChannels = Array.from(
    new Set(params.channels.map((channel) => channel.trim()).filter(Boolean))
  );

  if (!params.subject.trim()) {
    return NextResponse.json(
      {
        error: 'Missing realtime subject.',
      },
      {
        status: 400,
      }
    );
  }

  const subscriptionTokens: Record<string, string> = {};

  for (const channel of uniqueChannels) {
    subscriptionTokens[channel] = createCentrifugoSubscriptionToken({
      subject: params.subject,
      channel,
      ttlSeconds: params.ttlSeconds,
    });
  }

  return NextResponse.json({
    token: createCentrifugoConnectionToken({
      subject: params.subject,
      ttlSeconds: params.ttlSeconds,
    }),
    channels: uniqueChannels,
    subscriptionTokens,
  });
}

export function createRealtimeErrorResponse(message: string, status = 500) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
    }
  );
}
