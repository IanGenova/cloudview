'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createCentrifugoClient } from '@/lib/realtime/centrifugo-client';

type RealtimeServiceRequestEvent =
  | 'service-request-created'
  | 'service-request-updated'
  | 'service-request-billed'
  | 'service-request-payment-updated'
  | 'service-request-refund-updated';

type RealtimeServiceRequestPayload = {
  event?: RealtimeServiceRequestEvent;
  requestId?: string;
  requestCode?: string;
  status?: string;
  paymentStatus?: string;
  refundStatus?: string;
  refundedAmountCents?: number;
  billed?: boolean;
  updatedAt?: string;
};

const RELEVANT_EVENTS = new Set<RealtimeServiceRequestEvent>([
  'service-request-created',
  'service-request-updated',
  'service-request-billed',
  'service-request-payment-updated',
  'service-request-refund-updated',
]);

function eventKey(data: RealtimeServiceRequestPayload) {
  return [
    data.event || 'unknown',
    data.requestId || 'no-request-id',
    data.requestCode || 'no-request-code',
    data.status || 'no-status',
    data.paymentStatus || 'no-payment-status',
    data.refundStatus || 'no-refund-status',
    String(data.refundedAmountCents ?? 'no-refund-amount'),
    String(data.billed ?? 'no-billing-state'),
    data.updatedAt || 'no-time',
  ].join(':');
}

export function RealtimeGuestServiceRequestsRefresh({
  tagCode,
  fallbackIntervalMs = 120_000,
  refreshDebounceMs = 450,
}: {
  tagCode: string;
  fallbackIntervalMs?: number;
  refreshDebounceMs?: number;
}) {
  const router = useRouter();
  const refreshTimeoutRef = useRef<number | null>(null);
  const lastEventKeyRef = useRef('');
  const realtimeReadyRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    let centrifuge: ReturnType<typeof createCentrifugoClient> | null = null;
    let subscription: ReturnType<
      NonNullable<ReturnType<typeof createCentrifugoClient>>['newSubscription']
    > | null = null;

    function clearScheduledRefresh() {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    }

    function scheduleRefresh(reason: string, delayMs = refreshDebounceMs) {
      if (disposed) {
        return;
      }

      clearScheduledRefresh();

      refreshTimeoutRef.current = window.setTimeout(() => {
        if (disposed) {
          return;
        }

        lastRefreshAtRef.current = Date.now();

        if (process.env.NODE_ENV !== 'production') {
          console.info('Refreshing guest service requests:', { reason });
        }

        router.refresh();
        refreshTimeoutRef.current = null;
      }, delayMs);
    }

    const fallbackTimer = window.setInterval(() => {
      if (disposed || document.visibilityState === 'hidden') {
        return;
      }

      if (realtimeReadyRef.current) {
        return;
      }

      const elapsedSinceLastRefresh = Date.now() - lastRefreshAtRef.current;

      if (
        lastRefreshAtRef.current > 0 &&
        elapsedSinceLastRefresh < fallbackIntervalMs
      ) {
        return;
      }

      scheduleRefresh('fallback-polling', 0);
    }, Math.max(30_000, fallbackIntervalMs));

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        scheduleRefresh('tab-visible', 0);
      }
    }

    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    async function connect() {
      try {
        const tokenEndpoint = `/api/realtime/guest-service-requests-token?tagCode=${encodeURIComponent(
          tagCode
        )}`;

        const response = await fetch(tokenEndpoint, {
          cache: 'no-store',
        });

        if (!response.ok) {
          console.warn('Unable to get guest service-request Centrifugo token.');
          return;
        }

        const payload = (await response.json()) as {
          token?: string;
          channels?: string[];
        };

        if (!payload.token || !payload.channels?.length || disposed) {
          return;
        }

        centrifuge = createCentrifugoClient(payload.token, {
          tokenEndpoint,
          debugLabel: 'Guest service-request tracking',
        });

        if (!centrifuge) {
          return;
        }

        const channel = payload.channels[0];
        subscription = centrifuge.newSubscription(channel);

        subscription.on('publication', (ctx) => {
          const data = ctx.data as RealtimeServiceRequestPayload;

          if (!data.event || !RELEVANT_EVENTS.has(data.event)) {
            return;
          }

          const key = eventKey(data);

          if (key === lastEventKeyRef.current) {
            return;
          }

          lastEventKeyRef.current = key;
          scheduleRefresh(data.event);
        });

        subscription.on('subscribed', () => {
          realtimeReadyRef.current = true;

          if (process.env.NODE_ENV !== 'production') {
            console.info(`Subscribed to ${channel}`);
          }
        });

        subscription.on('unsubscribed', () => {
          realtimeReadyRef.current = false;
        });

        subscription.on('error', (ctx) => {
          realtimeReadyRef.current = false;
          console.warn('Guest service-request subscription error:', ctx);
        });

        centrifuge.on('disconnected', () => {
          realtimeReadyRef.current = false;
        });

        subscription.subscribe();
        centrifuge.connect();
      } catch (error) {
        realtimeReadyRef.current = false;
        console.error('Guest service-request realtime error:', error);
      }
    }

    connect();

    return () => {
      disposed = true;
      realtimeReadyRef.current = false;
      window.clearInterval(fallbackTimer);
      clearScheduledRefresh();
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      try {
        subscription?.unsubscribe();
        centrifuge?.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
    };
  }, [fallbackIntervalMs, refreshDebounceMs, router, tagCode]);

  return null;
}
