'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createCentrifugoClient } from '@/lib/realtime/centrifugo-client';

type RealtimeOrderEvent =
  | 'order-status-updated'
  | 'order-payment-updated'
  | 'order-refund-updated'
  | 'order-items-updated';

type RealtimeOrderPayload = {
  event?: RealtimeOrderEvent;
  orderCode?: string;
  status?: string;
  paymentStatus?: string;
  refundStatus?: string;
  refundedAmountCents?: number;
  updatedAt?: string;
};

const RELEVANT_EVENTS = new Set<RealtimeOrderEvent>([
  'order-status-updated',
  'order-payment-updated',
  'order-refund-updated',
  'order-items-updated',
]);

function eventKey(data: RealtimeOrderPayload) {
  return [
    data.event || 'unknown',
    data.orderCode || 'no-order',
    data.status || 'no-order-status',
    data.paymentStatus || 'no-payment-status',
    data.refundStatus || 'no-refund-status',
    String(data.refundedAmountCents ?? 'no-refund-amount'),
    data.updatedAt || 'no-time',
  ].join(':');
}

export function RealtimeGuestOrdersRefresh({
  tagCode,
  orderCodes,
  fallbackIntervalMs = 120_000,
  refreshDebounceMs = 500,
}: {
  tagCode: string;
  orderCodes: string[];
  fallbackIntervalMs?: number;
  refreshDebounceMs?: number;
}) {
  const router = useRouter();
  const normalizedOrderCodes = useMemo(
    () =>
      Array.from(
        new Set(orderCodes.map((value) => value.trim()).filter(Boolean))
      ).slice(0, 50),
    [orderCodes]
  );
  const orderCodeKey = normalizedOrderCodes.join(',');

  const refreshTimeoutRef = useRef<number | null>(null);
  const lastEventKeyRef = useRef('');
  const activeSubscriptionsRef = useRef(0);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    if (!orderCodeKey) {
      return;
    }

    let disposed = false;
    let centrifuge: ReturnType<typeof createCentrifugoClient> | null = null;
    const subscriptions: Array<
      ReturnType<
        NonNullable<ReturnType<typeof createCentrifugoClient>>['newSubscription']
      >
    > = [];

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
          console.info('Refreshing guest order history:', { reason });
        }

        router.refresh();
        refreshTimeoutRef.current = null;
      }, delayMs);
    }

    const fallbackTimer = window.setInterval(() => {
      if (disposed || document.visibilityState === 'hidden') {
        return;
      }

      if (activeSubscriptionsRef.current > 0) {
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
        const tokenEndpoint = `/api/realtime/centrifugo-token?tagCode=${encodeURIComponent(
          tagCode
        )}&orderCodes=${encodeURIComponent(orderCodeKey)}`;

        const response = await fetch(tokenEndpoint, {
          cache: 'no-store',
        });

        if (!response.ok) {
          console.warn('Unable to get guest order-list Centrifugo token.');
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
          debugLabel: 'Guest order history',
        });

        if (!centrifuge) {
          return;
        }

        for (const channel of payload.channels) {
          const subscription = centrifuge.newSubscription(channel);

          subscription.on('publication', (ctx) => {
            const data = ctx.data as RealtimeOrderPayload;

            if (!data.event || !RELEVANT_EVENTS.has(data.event)) {
              return;
            }

            if (
              data.orderCode &&
              !normalizedOrderCodes.includes(data.orderCode)
            ) {
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
            activeSubscriptionsRef.current += 1;
          });

          subscription.on('unsubscribed', () => {
            activeSubscriptionsRef.current = Math.max(
              activeSubscriptionsRef.current - 1,
              0
            );
          });

          subscription.on('error', (ctx) => {
            console.warn('Guest order-list subscription error:', ctx);
          });

          subscriptions.push(subscription);
          subscription.subscribe();
        }

        centrifuge.on('disconnected', () => {
          activeSubscriptionsRef.current = 0;
        });

        centrifuge.connect();
      } catch (error) {
        activeSubscriptionsRef.current = 0;
        console.error('Guest order-list realtime connection error:', error);
      }
    }

    connect();

    return () => {
      disposed = true;
      activeSubscriptionsRef.current = 0;
      window.clearInterval(fallbackTimer);
      clearScheduledRefresh();
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      try {
        for (const subscription of subscriptions) {
          subscription.unsubscribe();
        }

        centrifuge?.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
    };
  }, [
    fallbackIntervalMs,
    normalizedOrderCodes,
    orderCodeKey,
    refreshDebounceMs,
    router,
    tagCode,
  ]);

  return null;
}
