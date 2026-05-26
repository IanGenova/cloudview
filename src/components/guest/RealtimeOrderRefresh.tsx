'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPusherClient } from '@/lib/realtime/pusher-client';

export function RealtimeOrderRefresh({
  orderCode,
  fallbackIntervalMs = 30_000,
}: {
  orderCode: string;
  fallbackIntervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      router.refresh();
    };

    const fallbackTimer = window.setInterval(refresh, fallbackIntervalMs);

    const pusher = getPusherClient();

    if (!pusher) {
      return () => {
        window.clearInterval(fallbackTimer);
      };
    }

    const channelName = `order-${orderCode}`;
    const channel = pusher.subscribe(channelName);

    channel.bind('order-status-updated', refresh);
    channel.bind('order-payment-updated', refresh);

    return () => {
      channel.unbind('order-status-updated', refresh);
      channel.unbind('order-payment-updated', refresh);
      pusher.unsubscribe(channelName);
      window.clearInterval(fallbackTimer);
    };
  }, [orderCode, router, fallbackIntervalMs]);

  return null;
}