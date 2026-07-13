'use client';

import { useMemo } from 'react';
import { useRealtimeDashboardRefresh } from './useRealtimeDashboardRefresh';

type KitchenRealtimePayload = {
  event?: string;
  hotelId?: string;
  orderCode?: string;
  sessionId?: string;
  flowType?: string;
  status?: string;
  paymentStatus?: string;
  xenditStatus?: string;
  refundStatus?: string;
  source?: string;
  updatedAt?: string;
};

const VALID_KITCHEN_EVENTS = new Set([
  'kitchen.order.created',
  'kitchen.order.updated',
  'kitchen.order.paid',
  'kitchen.order.released',
  'scheduled.order.created',
  'scheduled.order.updated',
  'scheduled.order.released',
  'scheduled.order.cancelled',
  'order.scheduled',
  'order.released',
]);

function normalizeEventName(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_.\s-]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '');
}

function getKitchenEventKey(value: unknown) {
  const data = (value ?? {}) as KitchenRealtimePayload;

  return [
    normalizeEventName(data.event) || 'unknown-event',
    data.hotelId || 'no-hotel',
    data.orderCode || 'no-order',
    data.sessionId || 'no-session',
    data.status ||
      data.paymentStatus ||
      data.xenditStatus ||
      data.refundStatus ||
      'no-status',
    data.source || 'no-source',
    data.updatedAt || 'no-time',
  ].join(':');
}

function isRelevantKitchenEvent(value: unknown) {
  const data = (value ?? {}) as KitchenRealtimePayload;
  const event = normalizeEventName(data.event);
  const flowType = String(data.flowType ?? '').toUpperCase();

  if (!event) {
    return false;
  }

  if (VALID_KITCHEN_EVENTS.has(event)) {
    return true;
  }

  if (
    event.includes('kitchen.order') ||
    event.includes('scheduled.order') ||
    event.includes('order.released') ||
    event.includes('order.scheduled')
  ) {
    return true;
  }

  return (
    event.includes('xendit') &&
    (flowType === 'FOOD_ORDER' ||
      flowType === 'GUEST_FOOD_ORDER' ||
      flowType === 'POS_SALE' ||
      Boolean(data.orderCode))
  );
}

export function RealtimeKitchenRefresh({
  fallbackIntervalMs = 60_000,
  refreshDebounceMs = 700,
}: {
  fallbackIntervalMs?: number;
  refreshDebounceMs?: number;
}) {
  const tokenEndpoints = useMemo(
    () => [
      {
        url: '/api/realtime/kitchen-token',
        label: 'Kitchen dashboard',
      },
      {
        url: '/api/realtime/operations-token',
        label: 'Kitchen payment operations',
      },
    ],
    []
  );

  useRealtimeDashboardRefresh({
    tokenEndpoints,
    debugLabel: 'kitchen dashboard',
    fallbackIntervalMs,
    refreshDebounceMs,
    isRelevantEvent: isRelevantKitchenEvent,
    getEventKey: getKitchenEventKey,
  });

  return null;
}
