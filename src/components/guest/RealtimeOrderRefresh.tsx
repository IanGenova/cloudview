'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createCentrifugoClient } from '@/lib/realtime/centrifugo-client';

type RealtimeOrderPayload = {
  event?: 'order-status-updated' | 'order-payment-updated';
  orderCode?: string;
  status?: string;
  paymentStatus?: string;
  updatedAt?: string;
};

export function RealtimeOrderRefresh({
  tagCode,
  orderCode,
  fallbackIntervalMs = 30_000,
}: {
  tagCode: string;
  orderCode: string;
  fallbackIntervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let disposed = false;
    let centrifuge: ReturnType<typeof createCentrifugoClient> | null = null;
    let subscription: ReturnType<
      NonNullable<ReturnType<typeof createCentrifugoClient>>['newSubscription']
    > | null = null;

    const refresh = () => {
      router.refresh();
    };

    const fallbackTimer = window.setInterval(refresh, fallbackIntervalMs);

    async function connect() {
      try {
        const response = await fetch(
          `/api/realtime/centrifugo-token?tagCode=${encodeURIComponent(
            tagCode
          )}&orderCode=${encodeURIComponent(orderCode)}`,
          {
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          console.warn('Unable to get Centrifugo token.');
          return;
        }

        const payload = (await response.json()) as {
          token?: string;
        };

        if (!payload.token || disposed) {
          return;
        }

        centrifuge = createCentrifugoClient(payload.token);

        if (!centrifuge) {
          return;
        }

        subscription = centrifuge.newSubscription(`order-${orderCode}`);

        subscription.on('publication', (ctx) => {
          const data = ctx.data as RealtimeOrderPayload;

          if (!data?.event) {
            refresh();
            return;
          }

          if (
            data.event === 'order-status-updated' ||
            data.event === 'order-payment-updated'
          ) {
            refresh();
          }
        });

        subscription.on('subscribed', () => {
          console.log(`Subscribed to order-${orderCode}`);
        });

        subscription.on('error', (ctx) => {
          console.warn('Centrifugo subscription error:', ctx);
        });

        subscription.subscribe();
        centrifuge.connect();
      } catch (error) {
        console.error('Centrifugo realtime connection error:', error);
      }
    }

    connect();

    return () => {
      disposed = true;
      window.clearInterval(fallbackTimer);

      try {
        subscription?.unsubscribe();
        centrifuge?.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
    };
  }, [fallbackIntervalMs, orderCode, router, tagCode]);

  return null;
}