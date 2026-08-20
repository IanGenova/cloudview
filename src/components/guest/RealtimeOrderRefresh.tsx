'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  createCentrifugoClient,
  createSubscriptionOptions,
} from '@/lib/realtime/centrifugo-client';

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

function getEventKey(data: RealtimeOrderPayload) {
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

function isRelevantOrderEvent(data: RealtimeOrderPayload, orderCode: string) {
  if (!data?.event || !RELEVANT_EVENTS.has(data.event)) {
    return false;
  }

  if (data.orderCode && data.orderCode !== orderCode) {
    return false;
  }

  return true;
}

export function RealtimeOrderRefresh({
  tagCode,
  orderCode,
  fallbackIntervalMs = 120_000,
  refreshDebounceMs = 500,
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
        const tokenEndpoint = `/api/realtime/centrifugo-token?tagCode=${encodeURIComponent(
          tagCode
        )}&orderCode=${encodeURIComponent(orderCode)}`;

        const response = await fetch(tokenEndpoint, {
          cache: 'no-store',
        });

        if (!response.ok) {
          console.warn('Unable to get Centrifugo token.');
          return;
        }

        const payload = (await response.json()) as {
          token?: string;
          channels?: string[];
          subscriptionTokens?: Record<string, string>;
        };

        if (!payload.token || disposed) {
          return;
        }

        centrifuge = createCentrifugoClient(payload.token, {
          tokenEndpoint,
          debugLabel: `Order tracking ${orderCode}`,
        });

        if (!centrifuge) {
          return;
        }

        const channel = payload.channels?.[0] || `order-${orderCode}`;

        subscription = centrifuge.newSubscription(
          channel,
          createSubscriptionOptions({
            channel,
            subscriptionTokens: payload.subscriptionTokens,
            tokenEndpoint,
          })
        );

        subscription.on('publication', (ctx) => {
          const data = ctx.data as RealtimeOrderPayload;

          if (!isRelevantOrderEvent(data, orderCode)) {
            return;
          }

          const eventKey = getEventKey(data);

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
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);

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
