'use client';

import { useEffect, useRef } from 'react';
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

const VALID_SERVICE_REQUEST_EVENTS = new Set([
  'service-request-created',
  'service-request-updated',
  'service-request-billed',
]);

function getEventKey(data: ServiceRequestRealtimePayload) {
  return [
    data.event || 'unknown-event',
    data.hotelId || 'no-hotel',
    data.requestCode || data.requestId || 'no-request',
    data.status || 'no-status',
    data.source || 'no-source',
    data.updatedAt || 'no-time',
  ].join(':');
}

function isRelevantServiceRequestEvent(data: ServiceRequestRealtimePayload) {
  if (!data?.event) {
    return false;
  }

  return VALID_SERVICE_REQUEST_EVENTS.has(data.event);
}

export function RealtimeServiceRequestsRefresh({
  fallbackIntervalMs = 120_000,
  refreshDebounceMs = 700,
}: {
  fallbackIntervalMs?: number;
  refreshDebounceMs?: number;
}) {
  const router = useRouter();

  const refreshTimeoutRef = useRef<number | null>(null);
  const lastEventKeyRef = useRef('');
  const activeChannelsRef = useRef<Set<string>>(new Set());
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    let centrifuge: ReturnType<typeof createCentrifugoClient> | null = null;

    const subscriptions: Array<{
      unsubscribe: () => void;
    }> = [];

    function clearScheduledRefresh() {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    }

    function hasRealtimeConnection() {
      return activeChannelsRef.current.size > 0;
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
          console.info('Refreshing service requests dashboard:', {
            reason,
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
       * Do not poll while the browser tab is hidden.
       */
      if (document.visibilityState === 'hidden') {
        return;
      }

      /**
       * Do not poll if Centrifugo subscriptions are active.
       * Realtime events are already handling updates.
       */
      if (hasRealtimeConnection()) {
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
        const tokenEndpoint = '/api/realtime/service-requests-token';

        const response = await fetch(tokenEndpoint, {
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

        centrifuge = createCentrifugoClient(payload.token, {
          tokenEndpoint,
          debugLabel: 'Service requests dashboard',
        });

        if (!centrifuge) {
          return;
        }

        const uniqueChannels = Array.from(new Set(payload.channels));

        for (const channelName of uniqueChannels) {
          const subscription = centrifuge.newSubscription(channelName);

          subscription.on('publication', (ctx) => {
            const data = ctx.data as ServiceRequestRealtimePayload;

            if (!isRelevantServiceRequestEvent(data)) {
              return;
            }

            const eventKey = getEventKey(data);

            /**
             * Prevent duplicate refreshes.
             * This matters when a SUPER_ADMIN is subscribed to both global and hotel channels,
             * or when the same event is replayed after reconnect.
             */
            if (eventKey === lastEventKeyRef.current) {
              return;
            }

            lastEventKeyRef.current = eventKey;

            scheduleRefresh(data.event || 'service-request-publication');
          });

          subscription.on('subscribed', () => {
            activeChannelsRef.current.add(channelName);

            if (process.env.NODE_ENV !== 'production') {
              console.info(`Subscribed to ${channelName}`);
            }
          });

          subscription.on('unsubscribed', () => {
            activeChannelsRef.current.delete(channelName);

            if (process.env.NODE_ENV !== 'production') {
              console.warn(`Unsubscribed from ${channelName}`);
            }
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

        centrifuge.on('disconnected', () => {
          activeChannelsRef.current.clear();
        });

        centrifuge.connect();
      } catch (error) {
        activeChannelsRef.current.clear();
        console.error('Service request realtime connection error:', error);
      }
    }

    connect();

    return () => {
      disposed = true;

      window.clearInterval(fallbackTimer);
      clearScheduledRefresh();
      activeChannelsRef.current.clear();

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
  }, [fallbackIntervalMs, refreshDebounceMs, router]);

  return null;
}