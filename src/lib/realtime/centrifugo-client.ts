'use client';

import { Centrifuge } from 'centrifuge';

export function createCentrifugoClient(token: string) {
  const url = process.env.NEXT_PUBLIC_CENTRIFUGO_WS_URL;

  if (!url) {
    console.warn('NEXT_PUBLIC_CENTRIFUGO_WS_URL is missing.');
    return null;
  }

  return new Centrifuge(url, {
    token,
  });
}