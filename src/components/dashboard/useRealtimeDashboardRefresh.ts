'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createCentrifugoClient } from '@/lib/realtime/centrifugo-client';

type TokenEndpoint = {
  url: string;
  label: string;
};

type UseRealtimeDashboardRefreshInput = {
  tokenEndpoints: TokenEndpoint[];
  debugLabel: string;
  fallbackIntervalMs: number;
  refreshDebounceMs: number;
  isRelevantEvent: (data: unknown) => boolean;
  getEventKey: (data: unknown) => string;
};

const EVENT_DEDUPE_TTL_MS = 30_000;

export function useRealtimeDashboardRefresh({
  tokenEndpoints,
  debugLabel,
  fallbackIntervalMs,
  refreshDebounceMs,
  isRelevantEvent,
  getEventKey,
}: UseRealtimeDashboardRefreshInput) {
  const router = useRouter();
  const refreshTimeoutRef = useRef<number | null>(null);
  const recentEventKeysRef = useRef<Set<string>>(new Set());
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    let disposed = false;

    const clients: Array<ReturnType<typeof createCentrifugoClient>> = [];
    const subscriptions: Array<{ unsubscribe: () => void }> = [];
    const dedupeTimeouts: number[] = [];

    function clearScheduledRefresh() {
      if (refreshTimeoutRef.current !== null) {
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
          console.info(`Refreshing ${debugLabel}:`, { reason });
        }

        router.refresh();
        refreshTimeoutRef.current = null;
      }, Math.max(0, delayMs));
    }

    function markEventHandled(eventKey: string) {
      if (recentEventKeysRef.current.has(eventKey)) {
        return false;
      }

      recentEventKeysRef.current.add(eventKey);

      const timeoutId = window.setTimeout(() => {
        recentEventKeysRef.current.delete(eventKey);
      }, EVENT_DEDUPE_TTL_MS);

      dedupeTimeouts.push(timeoutId);
      return true;
    }

    async function connectEndpoint(endpoint: TokenEndpoint) {
      try {
        const response = await fetch(endpoint.url, {
          cache: 'no-store',
        });

        if (!response.ok) {
          console.warn(
            `${endpoint.label} realtime token request failed with HTTP ${response.status}.`
          );
          return;
        }

        const payload = (await response.json()) as {
          token?: string;
          channels?: string[];
        };

        if (
          disposed ||
          !payload.token ||
          !Array.isArray(payload.channels) ||
          payload.channels.length === 0
        ) {
          return;
        }

        const centrifuge = createCentrifugoClient(payload.token, {
          tokenEndpoint: endpoint.url,
          debugLabel: endpoint.label,
        });

        if (!centrifuge) {
          return;
        }

        clients.push(centrifuge);

        for (const channelName of Array.from(new Set(payload.channels))) {
          const subscription = centrifuge.newSubscription(channelName);

          subscription.on('publication', (ctx) => {
            const data = ctx.data as unknown;

            if (!isRelevantEvent(data)) {
              return;
            }

            const eventKey = getEventKey(data);

            if (!markEventHandled(eventKey)) {
              return;
            }

            scheduleRefresh(eventKey || 'realtime-publication');
          });

          subscription.on('error', (ctx) => {
            console.warn(
              `${debugLabel} subscription error on ${channelName}:`,
              ctx
            );
          });

          subscription.subscribe();
          subscriptions.push(subscription);
        }

        centrifuge.connect();
      } catch (error) {
        console.error(`${endpoint.label} realtime connection error:`, error);
      }
    }

    for (const endpoint of tokenEndpoints) {
      void connectEndpoint(endpoint);
    }

    const fallbackTimer = window.setInterval(() => {
      if (disposed || document.visibilityState === 'hidden') {
        return;
      }

      const elapsed = Date.now() - lastRefreshAtRef.current;

      if (lastRefreshAtRef.current > 0 && elapsed < fallbackIntervalMs) {
        return;
      }

      scheduleRefresh('safety-polling', 0);
    }, Math.max(30_000, fallbackIntervalMs));

    function handleVisibilityOrFocus() {
      if (disposed || document.visibilityState === 'hidden') {
        return;
      }

      if (Date.now() - lastRefreshAtRef.current >= 15_000) {
        scheduleRefresh('window-visible', 100);
      }
    }

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      disposed = true;
      window.clearInterval(fallbackTimer);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      clearScheduledRefresh();
      recentEventKeysRef.current.clear();

      for (const timeoutId of dedupeTimeouts) {
        window.clearTimeout(timeoutId);
      }

      for (const subscription of subscriptions) {
        try {
          subscription.unsubscribe();
        } catch {
          // Ignore cleanup errors.
        }
      }

      for (const client of clients) {
        try {
          client?.disconnect();
        } catch {
          // Ignore cleanup errors.
        }
      }
    };
  }, [
    debugLabel,
    fallbackIntervalMs,
    getEventKey,
    isRelevantEvent,
    refreshDebounceMs,
    router,
    tokenEndpoints,
  ]);
}
