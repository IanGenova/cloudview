'use client';

import { useMemo } from 'react';
import { useRealtimeDashboardRefresh } from './useRealtimeDashboardRefresh';

type ServiceRequestRealtimePayload = {
  event?: string;
  hotelId?: string;
  requestId?: string;
  requestCode?: string;
  sessionId?: string;
  flowType?: string;
  status?: string;
  paymentStatus?: string;
  payMongoStatus?: string;
  refundStatus?: string;
  source?: string;
  updatedAt?: string;
};

const VALID_SERVICE_REQUEST_EVENTS = new Set([
  'service.request.created',
  'service.request.updated',
  'service.request.billed',
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

function getServiceRequestEventKey(value: unknown) {
  const data = (value ?? {}) as ServiceRequestRealtimePayload;

  return [
    normalizeEventName(data.event) || 'unknown-event',
    data.hotelId || 'no-hotel',
    data.requestCode || data.requestId || 'no-request',
    data.sessionId || 'no-session',
    data.status ||
      data.paymentStatus ||
      data.payMongoStatus ||
      data.refundStatus ||
      'no-status',
    data.source || 'no-source',
    data.updatedAt || 'no-time',
  ].join(':');
}

function isRelevantServiceRequestEvent(value: unknown) {
  const data = (value ?? {}) as ServiceRequestRealtimePayload;
  const event = normalizeEventName(data.event);
  const flowType = String(data.flowType ?? '').toUpperCase();

  if (!event) {
    return false;
  }

  if (VALID_SERVICE_REQUEST_EVENTS.has(event)) {
    return true;
  }

  if (event.includes('service.request')) {
    return true;
  }

  return (
    event.includes('paymongo') &&
    (flowType === 'SERVICE_REQUEST' ||
      flowType === 'GUEST_SERVICE_REQUEST' ||
      Boolean(data.requestCode || data.requestId))
  );
}

export function RealtimeServiceRequestsRefresh({
  fallbackIntervalMs = 60_000,
  refreshDebounceMs = 700,
}: {
  fallbackIntervalMs?: number;
  refreshDebounceMs?: number;
}) {
  const tokenEndpoints = useMemo(
    () => [
      {
        url: '/api/realtime/service-requests-token',
        label: 'Service requests dashboard',
      },
      {
        url: '/api/realtime/operations-token',
        label: 'Service payment operations',
      },
    ],
    []
  );

  useRealtimeDashboardRefresh({
    tokenEndpoints,
    debugLabel: 'service requests dashboard',
    fallbackIntervalMs,
    refreshDebounceMs,
    isRelevantEvent: isRelevantServiceRequestEvent,
    getEventKey: getServiceRequestEventKey,
  });

  return null;
}
