'use client';

import { useMemo } from 'react';
import { useRealtimeDashboardRefresh } from './useRealtimeDashboardRefresh';

type InventoryRealtimePayload = {
  event?: string;
  hotelId?: string;
  productIds?: string[];
  sessionId?: string;
  flowType?: string;
  status?: string;
  refundStatus?: string;
  source?: string;
  updatedAt?: string;
};

function normalizeEventName(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_.\s-]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '');
}

function getInventoryEventKey(value: unknown) {
  const data = (value ?? {}) as InventoryRealtimePayload;

  return [
    normalizeEventName(data.event) || 'unknown-event',
    data.hotelId || 'no-hotel',
    Array.isArray(data.productIds)
      ? [...data.productIds].sort().join(',')
      : 'no-products',
    data.sessionId || 'no-session',
    data.status || data.refundStatus || 'no-status',
    data.source || 'no-source',
    data.updatedAt || 'no-time',
  ].join(':');
}

function isRelevantInventoryEvent(value: unknown) {
  const data = (value ?? {}) as InventoryRealtimePayload;
  const event = normalizeEventName(data.event);

  if (!event) {
    return false;
  }

  if (event === 'inventory.stock.updated' || event.includes('inventory')) {
    return true;
  }

  return (
    event.includes('xendit') &&
    (event.includes('refund') ||
      event.includes('rollback') ||
      event.includes('fulfillment'))
  );
}

export function RealtimeInventoryRefresh({
  fallbackIntervalMs = 60_000,
  refreshDebounceMs = 700,
}: {
  fallbackIntervalMs?: number;
  refreshDebounceMs?: number;
}) {
  const tokenEndpoints = useMemo(
    () => [
      {
        url: '/api/realtime/inventory-token',
        label: 'Inventory dashboard',
      },
      {
        url: '/api/realtime/operations-token',
        label: 'Inventory operations',
      },
    ],
    []
  );

  useRealtimeDashboardRefresh({
    tokenEndpoints,
    debugLabel: 'inventory dashboard',
    fallbackIntervalMs,
    refreshDebounceMs,
    isRelevantEvent: isRelevantInventoryEvent,
    getEventKey: getInventoryEventKey,
  });

  return null;
}
