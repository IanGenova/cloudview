import { NextResponse } from 'next/server';
import { createCentrifugoConnectionToken } from '@/lib/realtime/centrifugo-token';

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

  if (!uniqueChannels.length) {
    return NextResponse.json({
      token: createCentrifugoConnectionToken({
        subject: params.subject,
        ttlSeconds: params.ttlSeconds,
      }),
      channels: [],
    });
  }

  return NextResponse.json({
    token: createCentrifugoConnectionToken({
      subject: params.subject,
      ttlSeconds: params.ttlSeconds,
    }),
    channels: uniqueChannels,
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