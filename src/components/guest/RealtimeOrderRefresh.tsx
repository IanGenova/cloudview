'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createCentrifugoClient } from '@/lib/realtime/centrifugo-client';

type RealtimeOrderPayload = {
  event?: 'order-status-updated' | 'order-payment-updated';
  orderCode?: string;
  status?: string;
  paymentStatus?: string;
  updatedAt?: string;
};

function getEventKey(data: RealtimeOrderPayload) {
  return [
    data.event || 'unknown',
    data.orderCode || 'no-order',
    data.status || data.paymentStatus || 'no-status',
    data.updatedAt || 'no-time',
  ].join(':');
}

function isRelevantOrderEvent(data: RealtimeOrderPayload, orderCode: string) {
  if (!data?.event) {
    return false;
  }

  if (data.orderCode && data.orderCode !== orderCode) {
    return false;
  }

  return (
    data.event === 'order-status-updated' ||
    data.event === 'order-payment-updated'
  );
}

export function RealtimeOrderRefresh({
  tagCode,
  orderCode,
  fallbackIntervalMs = 120_000,
  refreshDebounceMs = 700,
}: {
  tagCode: string;
  orderCode: string;
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
          console.info('Refreshing order tracking page:', {
            reason,
            orderCode,
          });
        }

        router.refresh();
        refreshTimeoutRef.current = null;
      }, delayMs);
    }

    const fallbackTimer = window.setInterval(() => {
      if (disposed) {
        return;
      }

      /**
       * Do not keep hammering the server while the tab is hidden.
       */
      if (document.visibilityState === 'hidden') {
        return;
      }

      /**
       * If Centrifugo is subscribed, realtime is already handling updates.
       * The fallback should only work when realtime is unavailable.
       */
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
            channels?: string[];
          };

        if (!payload.token || disposed) {
          return;
        }

        centrifuge = createCentrifugoClient(payload.token, {
          tokenEndpoint: `/api/realtime/centrifugo-token?tagCode=${encodeURIComponent(
            tagCode
          )}&orderCode=${encodeURIComponent(orderCode)}`,
          debugLabel: `Order tracking ${orderCode}`,
        });

        if (!centrifuge) {
          return;
        }

        const channel = payload.channels?.[0] || `order-${orderCode}`;

        subscription = centrifuge.newSubscription(channel);

        subscription.on('publication', (ctx) => {
          const data = ctx.data as RealtimeOrderPayload;

          if (!isRelevantOrderEvent(data, orderCode)) {
            return;
          }

          const eventKey = getEventKey(data);

          /**
           * Avoid duplicate refreshes from duplicated publications,
           * reconnect replay, or repeated same payload.
           */
          if (eventKey === lastEventKeyRef.current) {
            return;
          }

          lastEventKeyRef.current = eventKey;

          scheduleRefresh(data.event || 'order-publication');
        });

        subscription.on('subscribed', () => {
          realtimeReadyRef.current = true;

          if (process.env.NODE_ENV !== 'production') {
            console.info(`Subscribed to ${channel}`);
          }
        });

        subscription.on('unsubscribed', () => {
          realtimeReadyRef.current = false;

          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Unsubscribed from ${channel}`);
          }
        });

        subscription.on('error', (ctx) => {
          realtimeReadyRef.current = false;
          console.warn('Centrifugo order subscription error:', ctx);
        });

        centrifuge.on('disconnected', () => {
          realtimeReadyRef.current = false;
        });

        subscription.subscribe();
        centrifuge.connect();
      } catch (error) {
        realtimeReadyRef.current = false;
        console.error('Centrifugo realtime connection error:', error);
      }
    }

    connect();

    return () => {
      disposed = true;
      realtimeReadyRef.current = false;

      window.clearInterval(fallbackTimer);
      clearScheduledRefresh();

      try {
        subscription?.unsubscribe();
        centrifuge?.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
    };
  }, [
    fallbackIntervalMs,
    orderCode,
    refreshDebounceMs,
    router,
    tagCode,
  ]);

  return null;
}