'use client';

import Pusher from 'pusher-js';

let pusherClient: Pusher | null = null;

export function getPusherClient() {
  if (pusherClient) {
    return pusherClient;
  }

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!key || !cluster) {
    console.warn('Pusher client environment variables are incomplete.');
    return null;
  }

  pusherClient = new Pusher(key, {
    cluster,
  });

  return pusherClient;
}