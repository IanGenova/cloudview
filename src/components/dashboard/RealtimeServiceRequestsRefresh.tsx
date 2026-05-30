'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createCentrifugoClient } from '@/lib/realtime/centrifugo-client';

type ServiceRequestRealtimePayload = {
  event?:
    | 'service-request-created'
    | 'service-request-updated'
    | 'service-request-billed';
  hotelId?: string;
  requestId?: string;
  requestCode?: string;
  status?: string;
  source?: string;
  updatedAt?: string;
};

export function RealtimeServiceRequestsRefresh({
  fallbackIntervalMs = 30_000,
}: {
  fallbackIntervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let disposed = false;
    let centrifuge: ReturnType<typeof createCentrifugoClient> | null = null;

    const subscriptions: Array<{
      unsubscribe: () => void;
    }> = [];

    const refresh = () => {
      router.refresh();
    };

    const fallbackTimer = window.setInterval(refresh, fallbackIntervalMs);

    async function connect() {
      try {
        const response = await fetch('/api/realtime/service-requests-token', {
          cache: 'no-store',
        });

        if (!response.ok) {
          console.warn('Unable to get service request Centrifugo token.');
          return;
        }

        const payload = (await response.json()) as {
          token?: string;
          channels?: string[];
        };

        if (!payload.token || !payload.channels?.length || disposed) {
          return;
        }

        centrifuge = createCentrifugoClient(payload.token);

        if (!centrifuge) {
          return;
        }

        for (const channelName of payload.channels) {
          const subscription = centrifuge.newSubscription(channelName);

          subscription.on('publication', (ctx) => {
            const data = ctx.data as ServiceRequestRealtimePayload;

            if (
              data?.event === 'service-request-created' ||
              data?.event === 'service-request-updated' ||
              data?.event === 'service-request-billed'
            ) {
              refresh();
              return;
            }

            refresh();
          });

          subscription.on('subscribed', () => {
            console.log(`Subscribed to ${channelName}`);
          });

          subscription.on('error', (ctx) => {
            console.warn(
              `Service request realtime subscription error: ${channelName}`,
              ctx
            );
          });

          subscription.subscribe();
          subscriptions.push(subscription);
        }

        centrifuge.connect();
      } catch (error) {
        console.error('Service request realtime connection error:', error);
      }
    }

    connect();

    return () => {
      disposed = true;
      window.clearInterval(fallbackTimer);

      for (const subscription of subscriptions) {
        try {
          subscription.unsubscribe();
        } catch {
          // Ignore unsubscribe errors.
        }
      }

      try {
        centrifuge?.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
    };
  }, [fallbackIntervalMs, router]);

  return null;
}