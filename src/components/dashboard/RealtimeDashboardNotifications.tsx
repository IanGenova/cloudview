'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Ban,
  BellRing,
  ChefHat,
  ConciergeBell,
  PackageMinus,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createCentrifugoClient } from '@/lib/realtime/centrifugo-client';

const REALTIME_ENDPOINTS = {
  kitchen: '/api/realtime/kitchen-token',
  service: '/api/realtime/service-requests-token',
  operations: '/api/realtime/operations-token',
};

type KitchenPayload = {
  event?: string;
  hotelId?: string;
  orderCode?: string;
  status?: string;
  paymentStatus?: string;
  source?: string;
  updatedAt?: string;
};

type ServiceRequestPayload = {
  event?: string;
  hotelId?: string;
  requestId?: string;
  requestCode?: string;
  status?: string;
  source?: string;
  updatedAt?: string;
};

type LowStockPayload = {
  event: 'inventory.low_stock';
  hotelId: string;
  inventoryItemId: string;
  itemName: string;
  availableQty: number;
  reorderLevel: number;
  unit: string;
  source?: string;
  updatedAt?: string;
};

type CancelledItemPayload = {
  event: 'order.item_cancelled' | 'order.cancelled';
  hotelId: string;
  orderId?: string;
  orderCode: string;
  itemName?: string;
  cancelledQty?: number;
  reason?: string;
  source?: string;
  updatedAt?: string;
};

type OperationsPayload = LowStockPayload | CancelledItemPayload;

type DashboardNotification = {
  id: string;
  type:
    | 'ORDER'
    | 'SERVICE_REQUEST'
    | 'LOW_STOCK'
    | 'CANCELLED_ITEM'
    | 'SYSTEM';
  title: string;
  message: string;
  href: string;
  createdAt: number;
};

type BrowserAudioContextConstructor = typeof AudioContext;

type RealtimeStatus =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

type RealtimeErrorContext = {
  error?: {
    code?: number;
    message?: string;
  };
  transport?: string;
  type?: string;
};

type NotificationPermissionState = NotificationPermission | 'unsupported';

function createNotificationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeValue(value?: string | null) {
  return String(value ?? '').trim().toUpperCase();
}

function normalizeEventName(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '');
}

function eventHasWords(event: string, words: string[]) {
  return words.every((word) => event.includes(word));
}

function getEventFromUnknown(data: unknown) {
  if (!data || typeof data !== 'object' || !('event' in data)) {
    return '';
  }

  const event = (data as { event?: unknown }).event;

  return typeof event === 'string' ? event : '';
}

function formatSource(source?: string) {
  return source ? source.replace(/_/g, ' ') : '';
}

function isKitchenOrderCreatedEvent(data: KitchenPayload) {
  const event = normalizeEventName(data.event);
  const source = normalizeValue(data.source);
  const status = normalizeValue(data.status);

  const isCreatedEvent =
    eventHasWords(event, ['kitchen', 'order', 'created']) ||
    eventHasWords(event, ['order', 'created']) ||
    event === 'kitchen.order.new' ||
    event === 'order.new';

  if (isCreatedEvent) {
    return true;
  }

  /**
   * Fallback for older publishers that do not send a clean event name.
   */
  if (
    data.orderCode &&
    status === 'PENDING' &&
    source !== 'DASHBOARD' &&
    source !== 'KITCHEN'
  ) {
    return true;
  }

  return false;
}

function isServiceRequestCreatedEvent(data: ServiceRequestPayload) {
  const event = normalizeEventName(data.event);
  const source = normalizeValue(data.source);
  const status = normalizeValue(data.status);

  const isCreatedEvent =
    eventHasWords(event, ['service', 'request', 'created']) ||
    eventHasWords(event, ['service', 'created']) ||
    event === 'service.request.new' ||
    event === 'service.new';

  if (isCreatedEvent) {
    return true;
  }

  /**
   * Fallback for older publishers that do not send a clean event name.
   */
  if (
    (data.requestCode || data.requestId) &&
    (!status || status === 'PENDING' || status === 'NEW') &&
    source !== 'DASHBOARD'
  ) {
    return true;
  }

  return false;
}

function isLowStockEvent(data: unknown): data is LowStockPayload {
  const event = normalizeEventName(getEventFromUnknown(data));

  return (
    event === 'inventory.low.stock' ||
    event === 'inventory.lowstock' ||
    eventHasWords(event, ['inventory', 'low', 'stock'])
  );
}

function isCancelledItemEvent(data: unknown): data is CancelledItemPayload {
  const event = normalizeEventName(getEventFromUnknown(data));

  return (
    event === 'order.item.cancelled' ||
    event === 'order.cancelled' ||
    eventHasWords(event, ['order', 'item', 'cancelled']) ||
    eventHasWords(event, ['order', 'cancelled'])
  );
}

function getAudioContextConstructor(): BrowserAudioContextConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return (
    window.AudioContext ??
    (window as typeof window & {
      webkitAudioContext?: BrowserAudioContextConstructor;
    }).webkitAudioContext ??
    null
  );
}

function scheduleTone(
  audioContext: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume = 0.55
) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startTime);

  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(volume, startTime + 0.025);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.05);
}

function canUseBrowserNotifications() {
  if (typeof window === 'undefined') {
    return false;
  }

  if (!('Notification' in window)) {
    return false;
  }

  return window.isSecureContext || window.location.hostname === 'localhost';
}

function getRealtimeErrorContext(value: unknown): RealtimeErrorContext {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return value as RealtimeErrorContext;
}

function isTransportClosedError(value: unknown) {
  const ctx = getRealtimeErrorContext(value);

  return (
    ctx.error?.code === 2 &&
    String(ctx.error?.message ?? '').toLowerCase() === 'transport closed'
  );
}

function getRealtimeErrorMessage(value: unknown) {
  const ctx = getRealtimeErrorContext(value);

  return ctx.error?.message || ctx.type || null;
}

function getNotificationIcon(type: DashboardNotification['type']) {
  if (type === 'ORDER') {
    return ChefHat;
  }

  if (type === 'SERVICE_REQUEST') {
    return ConciergeBell;
  }

  if (type === 'LOW_STOCK') {
    return PackageMinus;
  }

  if (type === 'CANCELLED_ITEM') {
    return Ban;
  }

  return BellRing;
}

function getNotificationStyle(type: DashboardNotification['type']) {
  if (type === 'LOW_STOCK') {
    return {
      iconWrap: 'bg-amber-100 text-amber-700',
      border: 'border-amber-200',
    };
  }

  if (type === 'CANCELLED_ITEM') {
    return {
      iconWrap: 'bg-red-100 text-red-700',
      border: 'border-red-200',
    };
  }

  if (type === 'ORDER') {
    return {
      iconWrap: 'bg-emerald-100 text-emerald-700',
      border: 'border-emerald-200',
    };
  }

  if (type === 'SERVICE_REQUEST') {
    return {
      iconWrap: 'bg-blue-100 text-blue-700',
      border: 'border-blue-200',
    };
  }

  return {
    iconWrap: 'bg-neutral-100 text-neutral-700',
    border: 'border-neutral-200',
  };
}

export function RealtimeDashboardNotifications() {
  const router = useRouter();

  const [notifications, setNotifications] = useState<DashboardNotification[]>(
    []
  );

  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const alertsEnabledRef = useRef(false);

  const [browserNotificationPermission, setBrowserNotificationPermission] =
    useState<NotificationPermissionState>('unsupported');

  const [kitchenStatus, setKitchenStatus] =
    useState<RealtimeStatus>('disabled');

  const [serviceStatus, setServiceStatus] =
    useState<RealtimeStatus>('disabled');

  const [operationsStatus, setOperationsStatus] =
    useState<RealtimeStatus>('disabled');

  const [lastRealtimeIssue, setLastRealtimeIssue] = useState<string | null>(
    null
  );

  const audioContextRef = useRef<AudioContext | null>(null);
  const recentEventKeysRef = useRef<Set<string>>(new Set());
  const notificationTimeoutsRef = useRef<number[]>([]);

  useEffect(() => {
    const savedValue = window.localStorage.getItem(
      'cloudview-dashboard-alerts-enabled'
    );

    const enabled = savedValue === 'true';

    setAlertsEnabled(enabled);
    alertsEnabledRef.current = enabled;

    if (!canUseBrowserNotifications()) {
      setBrowserNotificationPermission('unsupported');
      return;
    }

    setBrowserNotificationPermission(Notification.permission);
  }, []);

  function scheduleNotificationRemoval(id: string) {
  const timeoutId = window.setTimeout(() => {
    removeNotification(id);
  }, 15_000);

  notificationTimeoutsRef.current.push(timeoutId);
}

  function removeNotification(id: string) {
    setNotifications((current) =>
      current.filter((notification) => notification.id !== id)
    );
  }

  async function playNotificationSound(force = false) {
    if (!force && !alertsEnabledRef.current) {
      return;
    }

    try {
      const AudioContextConstructor = getAudioContextConstructor();

      if (!AudioContextConstructor) {
        console.warn('AudioContext is not supported in this browser.');
        return;
      }

      const audioContext =
        audioContextRef.current ?? new AudioContextConstructor();

      audioContextRef.current = audioContext;

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      if (audioContext.state !== 'running') {
        console.warn(
          `Notification audio could not start. AudioContext state: ${audioContext.state}`
        );
        return;
      }

      const now = audioContext.currentTime;

      scheduleTone(audioContext, 880, now, 0.16, 0.6);
      scheduleTone(audioContext, 1175, now + 0.22, 0.18, 0.6);
      scheduleTone(audioContext, 1568, now + 0.48, 0.28, 0.65);
    } catch (error) {
      console.warn('Unable to play notification sound:', error);
    }
  }

  function showBrowserNotification(notification: DashboardNotification) {
    if (typeof window === 'undefined') {
      return;
    }

    if (!canUseBrowserNotifications()) {
      console.warn(
        'Browser notifications are unavailable. Use HTTPS for LAN IP access.'
      );
      return;
    }

    if (Notification.permission !== 'granted') {
      return;
    }

    const browserNotification = new Notification(notification.title, {
      body: notification.message,
      tag: notification.id,
      icon: '/favicon.ico',
      silent: true,
      requireInteraction: false,
    });

    browserNotification.onclick = () => {
      window.focus();
      router.push(notification.href);
      browserNotification.close();
    };
  }

  function pushNotification(notification: DashboardNotification) {
  void playNotificationSound();

  if (alertsEnabledRef.current) {
    showBrowserNotification(notification);
  }

  setNotifications((current) => [notification, ...current].slice(0, 6));

  scheduleNotificationRemoval(notification.id);
}

  function pushSystemNotification(message: string) {
    const notification: DashboardNotification = {
      id: createNotificationId(),
      type: 'SYSTEM',
      title: 'Dashboard Realtime',
      message,
      href: '/dashboard/orders',
      createdAt: Date.now(),
    };

    setNotifications((current) => [notification, ...current].slice(0, 6));

    scheduleNotificationRemoval(notification.id);

  }

  function pushTestNotification() {
    const notification: DashboardNotification = {
      id: createNotificationId(),
      type: 'SYSTEM',
      title: 'Dashboard Alerts Test',
      message: 'Sound cue, in-app alert, and browser notification test.',
      href: '/dashboard/orders',
      createdAt: Date.now(),
    };

    void playNotificationSound(true);
    if (alertsEnabledRef.current) {
  showBrowserNotification(notification);
}

    setNotifications((current) => [notification, ...current].slice(0, 6));

    scheduleNotificationRemoval(notification.id);
  }

  async function enableAlerts() {
    setAlertsEnabled(true);
    alertsEnabledRef.current = true;

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('cloudview-dashboard-alerts-enabled', 'true');
    }

    try {
      await playNotificationSound(true);

      if (!canUseBrowserNotifications()) {
        setBrowserNotificationPermission('unsupported');

        setNotifications((current) => [
          {
            id: createNotificationId(),
            type: 'SYSTEM',
            title: 'Sound Alerts Enabled',
            message:
              'In-app alerts and sound are enabled. Browser push notifications require HTTPS for LAN IP access.',
            href: '/dashboard/orders',
            createdAt: Date.now(),
          },
          ...current,
        ]);

        return;
      }

      if (Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        setBrowserNotificationPermission(permission);

        if (permission === 'granted') {
          window.setTimeout(() => {
            pushTestNotification();
          }, 250);
        }

        return;
      }

      setBrowserNotificationPermission(Notification.permission);

      window.setTimeout(() => {
        pushTestNotification();
      }, 250);
    } catch (error) {
      console.warn('Unable to fully enable dashboard alerts:', error);
    }
  }

  function disableAlerts() {
    setAlertsEnabled(false);
    alertsEnabledRef.current = false;

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('cloudview-dashboard-alerts-enabled', 'false');
    }
  }

  function hasRecentlyHandled(key: string) {
    if (recentEventKeysRef.current.has(key)) {
      return true;
    }

    recentEventKeysRef.current.add(key);

    window.setTimeout(() => {
      recentEventKeysRef.current.delete(key);
    }, 30_000);

    return false;
  }

  useEffect(() => {
    let disposed = false;

    let kitchenCentrifuge: ReturnType<typeof createCentrifugoClient> | null =
      null;

    let serviceCentrifuge: ReturnType<typeof createCentrifugoClient> | null =
      null;

    let operationsCentrifuge: ReturnType<typeof createCentrifugoClient> | null =
      null;

    const subscriptions: Array<{
      unsubscribe: () => void;
    }> = [];

    function handleKitchenClientError(ctx: unknown) {
      const message = getRealtimeErrorMessage(ctx);

      if (isTransportClosedError(ctx)) {
        console.warn(
          'Kitchen realtime transport closed. Check WSS/TLS, allowed origins, token secret, and Centrifugo config.',
          ctx
        );

        setKitchenStatus('reconnecting');
        setLastRealtimeIssue(
          message ||
            'Kitchen realtime transport closed. Check Centrifugo WSS/TLS, allowed origins, and token secret.'
        );

        return;
      }

      console.error('Kitchen realtime client error:', ctx);
      setKitchenStatus('error');
      setLastRealtimeIssue(message || 'Kitchen realtime client error.');
    }

    function handleServiceClientError(ctx: unknown) {
      const message = getRealtimeErrorMessage(ctx);

      if (isTransportClosedError(ctx)) {
        console.warn(
          'Service request realtime transport closed. Check WSS/TLS, allowed origins, token secret, and Centrifugo config.',
          ctx
        );

        setServiceStatus('reconnecting');
        setLastRealtimeIssue(
          message ||
            'Service realtime transport closed. Check Centrifugo WSS/TLS, allowed origins, and token secret.'
        );

        return;
      }

      console.error('Service request realtime client error:', ctx);
      setServiceStatus('error');
      setLastRealtimeIssue(message || 'Service request realtime client error.');
    }

    function handleOperationsClientError(ctx: unknown) {
      const message = getRealtimeErrorMessage(ctx);

      if (isTransportClosedError(ctx)) {
        console.warn(
          'Operations realtime transport closed. Check WSS/TLS, allowed origins, token secret, and Centrifugo config.',
          ctx
        );

        setOperationsStatus('reconnecting');
        setLastRealtimeIssue(
          message ||
            'Operations realtime transport closed. Check Centrifugo WSS/TLS, allowed origins, and token secret.'
        );

        return;
      }

      console.error('Operations realtime client error:', ctx);
      setOperationsStatus('error');
      setLastRealtimeIssue(message || 'Operations realtime client error.');
    }

    async function getRealtimePayload(endpoint: string, label: string) {
      const response = await fetch(endpoint, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(
          `${label} token route failed. HTTP ${response.status}. Check ${endpoint} and CENTRIFUGO_TOKEN_HMAC_SECRET.`
        );
      }

      return (await response.json()) as {
        token?: string;
        channels?: string[];
      };
    }

    async function connectKitchenNotifications() {
      setKitchenStatus('connecting');

      try {
        const payload = await getRealtimePayload(
          REALTIME_ENDPOINTS.kitchen,
          'Kitchen'
        );

        if (disposed) {
          return;
        }

        if (!payload.token) {
          setKitchenStatus('error');
          setLastRealtimeIssue('Kitchen token route returned no token.');
          return;
        }

        if (!payload.channels?.length) {
          setKitchenStatus('disabled');
          return;
        }

        kitchenCentrifuge = createCentrifugoClient(payload.token, {
          tokenEndpoint: REALTIME_ENDPOINTS.kitchen,
          debugLabel: 'Kitchen realtime',
        });

        if (!kitchenCentrifuge) {
          setKitchenStatus('error');
          setLastRealtimeIssue('Unable to create kitchen Centrifugo client.');
          return;
        }

        kitchenCentrifuge.on('connected', () => {
          console.info('Kitchen realtime connected.');
          setKitchenStatus('connected');
          setLastRealtimeIssue(null);
        });

        kitchenCentrifuge.on('connecting', () => {
          console.info('Kitchen realtime connecting.');
          setKitchenStatus('connecting');
        });

        kitchenCentrifuge.on('disconnected', () => {
          console.warn('Kitchen realtime disconnected.');
          setKitchenStatus('reconnecting');
        });

        kitchenCentrifuge.on('error', handleKitchenClientError);

        for (const channelName of Array.from(new Set(payload.channels))) {
          const subscription = kitchenCentrifuge.newSubscription(channelName);

          subscription.on('publication', (ctx) => {
            const data = ctx.data as KitchenPayload;

            console.info('Kitchen realtime publication:', data);

            if (!isKitchenOrderCreatedEvent(data)) {
              return;
            }

            const orderCode = data.orderCode ?? 'New order';
            const eventKey = `kitchen:${orderCode}:${data.status ?? ''}:${
              data.updatedAt ?? ''
            }`;

            if (hasRecentlyHandled(eventKey)) {
              return;
            }

            pushNotification({
              id: createNotificationId(),
              type: 'ORDER',
              title: 'New Food Order',
              message: `${orderCode} is waiting for kitchen review.${
                data.paymentStatus ? ` Payment: ${data.paymentStatus}.` : ''
              }`,
              href: '/dashboard/orders',
              createdAt: Date.now(),
            });
          });

          subscription.on('subscribed', () => {
            console.info(`Subscribed to kitchen channel: ${channelName}`);
          });

          subscription.on('error', (ctx) => {
            console.error(`Kitchen subscription error: ${channelName}`, ctx);
          });

          subscription.subscribe();
          subscriptions.push(subscription);
        }

        kitchenCentrifuge.connect();
      } catch (error) {
        console.error('Kitchen notification realtime error:', error);
        setKitchenStatus('error');
        setLastRealtimeIssue(
          error instanceof Error
            ? error.message
            : 'Kitchen realtime setup failed.'
        );
      }
    }

    async function connectServiceRequestNotifications() {
      setServiceStatus('connecting');

      try {
        const payload = await getRealtimePayload(
          REALTIME_ENDPOINTS.service,
          'Service'
        );

        if (disposed) {
          return;
        }

        if (!payload.token) {
          setServiceStatus('error');
          setLastRealtimeIssue('Service token route returned no token.');
          return;
        }

        if (!payload.channels?.length) {
          setServiceStatus('disabled');
          return;
        }

        serviceCentrifuge = createCentrifugoClient(payload.token, {
          tokenEndpoint: REALTIME_ENDPOINTS.service,
          debugLabel: 'Service request realtime',
        });

        if (!serviceCentrifuge) {
          setServiceStatus('error');
          setLastRealtimeIssue('Unable to create service Centrifugo client.');
          return;
        }

        serviceCentrifuge.on('connected', () => {
          console.info('Service request realtime connected.');
          setServiceStatus('connected');
          setLastRealtimeIssue(null);
        });

        serviceCentrifuge.on('connecting', () => {
          console.info('Service request realtime connecting.');
          setServiceStatus('connecting');
        });

        serviceCentrifuge.on('disconnected', () => {
          console.warn('Service request realtime disconnected.');
          setServiceStatus('reconnecting');
        });

        serviceCentrifuge.on('error', handleServiceClientError);

        for (const channelName of Array.from(new Set(payload.channels))) {
          const subscription = serviceCentrifuge.newSubscription(channelName);

          subscription.on('publication', (ctx) => {
            const data = ctx.data as ServiceRequestPayload;

            console.info('Service request realtime publication:', data);

            if (!isServiceRequestCreatedEvent(data)) {
              return;
            }

            const requestCode =
              data.requestCode ?? data.requestId ?? 'New service request';

            const eventKey = `service:${requestCode}:${data.status ?? ''}:${
              data.updatedAt ?? ''
            }`;

            if (hasRecentlyHandled(eventKey)) {
              return;
            }

            pushNotification({
              id: createNotificationId(),
              type: 'SERVICE_REQUEST',
              title: 'New Service Request',
              message: `${requestCode} needs staff attention.`,
              href: '/dashboard/service-requests',
              createdAt: Date.now(),
            });
          });

          subscription.on('subscribed', () => {
            console.info(`Subscribed to service channel: ${channelName}`);
          });

          subscription.on('error', (ctx) => {
            console.error(`Service subscription error: ${channelName}`, ctx);
          });

          subscription.subscribe();
          subscriptions.push(subscription);
        }

        serviceCentrifuge.connect();
      } catch (error) {
        console.error('Service request realtime error:', error);
        setServiceStatus('error');
        setLastRealtimeIssue(
          error instanceof Error
            ? error.message
            : 'Service realtime setup failed.'
        );
      }
    }

    async function connectOperationsNotifications() {
      setOperationsStatus('connecting');

      try {
        const payload = await getRealtimePayload(
          REALTIME_ENDPOINTS.operations,
          'Operations'
        );

        if (disposed) {
          return;
        }

        if (!payload.token) {
          console.warn('Operations realtime token route returned no token.');
          setOperationsStatus('error');
          setLastRealtimeIssue('Operations token route returned no token.');
          return;
        }

        if (!payload.channels?.length) {
          console.warn('Operations realtime token route returned no channels.');
          setOperationsStatus('disabled');
          return;
        }

        operationsCentrifuge = createCentrifugoClient(payload.token, {
          tokenEndpoint: REALTIME_ENDPOINTS.operations,
          debugLabel: 'Operations realtime',
        });

        if (!operationsCentrifuge) {
          console.warn('Unable to create operations Centrifugo client.');
          setOperationsStatus('error');
          setLastRealtimeIssue('Unable to create operations Centrifugo client.');
          return;
        }

        operationsCentrifuge.on('connected', () => {
          console.info('Operations realtime connected.');
          setOperationsStatus('connected');
          setLastRealtimeIssue(null);
        });

        operationsCentrifuge.on('connecting', () => {
          console.info('Operations realtime connecting.');
          setOperationsStatus('connecting');
        });

        operationsCentrifuge.on('disconnected', () => {
          console.warn('Operations realtime disconnected.');
          setOperationsStatus('reconnecting');
        });

        operationsCentrifuge.on('error', handleOperationsClientError);

        for (const channelName of Array.from(new Set(payload.channels))) {
          const subscription =
            operationsCentrifuge.newSubscription(channelName);

          subscription.on('publication', (ctx) => {
            const data = ctx.data as OperationsPayload;

            console.info('Operations realtime publication:', data);

            if (isLowStockEvent(data)) {
              const eventKey = `low-stock:${data.inventoryItemId}:${
                data.availableQty
              }:${data.updatedAt ?? ''}`;

              if (hasRecentlyHandled(eventKey)) {
                return;
              }

              pushNotification({
                id: createNotificationId(),
                type: 'LOW_STOCK',
                title: 'Low Stock Alert',
                message: `${data.itemName} is down to ${data.availableQty} ${
                  data.unit
                }. Reorder level is ${data.reorderLevel} ${data.unit}.${
                  data.source ? ` Source: ${formatSource(data.source)}.` : ''
                }`,
                href: '/dashboard/inventory',
                createdAt: Date.now(),
              });

              return;
            }

            if (isCancelledItemEvent(data)) {
              const eventKey = `cancelled:${data.orderCode}:${
                data.itemName ?? 'order'
              }:${data.cancelledQty ?? 0}:${data.updatedAt ?? ''}`;

              if (hasRecentlyHandled(eventKey)) {
                return;
              }

              pushNotification({
                id: createNotificationId(),
                type: 'CANCELLED_ITEM',
                title:
                  data.event === 'order.cancelled'
                    ? 'Order Cancelled'
                    : 'Item Cancelled',
                message:
                  data.event === 'order.cancelled'
                    ? `Order ${data.orderCode} was cancelled${
                        data.reason ? `. Reason: ${data.reason}` : '.'
                      }`
                    : `${data.cancelledQty ?? 1}× ${
                        data.itemName ?? 'item'
                      } was cancelled from ${data.orderCode}${
                        data.reason ? `. Reason: ${data.reason}` : '.'
                      }`,
                href: '/dashboard/orders',
                createdAt: Date.now(),
              });
            }
          });

          subscription.on('subscribed', () => {
            console.info(`Subscribed to operations channel: ${channelName}`);
          });

          subscription.on('error', (ctx) => {
            console.error(`Operations subscription error: ${channelName}`, ctx);
          });

          subscription.subscribe();
          subscriptions.push(subscription);
        }

        operationsCentrifuge.connect();
      } catch (error) {
        console.error('Operations notification realtime error:', error);
        setOperationsStatus('error');
        setLastRealtimeIssue(
          error instanceof Error
            ? error.message
            : 'Operations realtime setup failed.'
        );
      }
    }

    void connectKitchenNotifications();
    void connectServiceRequestNotifications();
    void connectOperationsNotifications();

    return () => {
      disposed = true;

      for (const subscription of subscriptions) {
        try {
          subscription.unsubscribe();
        } catch {
          // Ignore unsubscribe errors.
        }
      }

      try {
        kitchenCentrifuge?.disconnect();
      } catch {
        // Ignore disconnect errors.
      }

      try {
        serviceCentrifuge?.disconnect();
      } catch {
        // Ignore disconnect errors.
      }

      try {
        operationsCentrifuge?.disconnect();
      } catch {
        // Ignore disconnect errors.
      }
    };
  }, []);

  const hasRealtimeError =
    kitchenStatus === 'error' ||
    serviceStatus === 'error' ||
    operationsStatus === 'error';

  const realtimeConnected =
    kitchenStatus === 'connected' ||
    serviceStatus === 'connected' ||
    operationsStatus === 'connected';

  const realtimeConnecting =
    kitchenStatus === 'connecting' ||
    kitchenStatus === 'reconnecting' ||
    serviceStatus === 'connecting' ||
    serviceStatus === 'reconnecting' ||
    operationsStatus === 'connecting' ||
    operationsStatus === 'reconnecting';

  const realtimeStatusLabel = hasRealtimeError
    ? 'Issue'
    : realtimeConnected
      ? 'Live'
      : realtimeConnecting
        ? 'Connecting'
        : 'Offline';

  const RealtimeIcon = realtimeConnected ? Wifi : WifiOff;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[calc(100vw-2.5rem)] max-w-md flex-col items-end gap-3">
      <div className="w-full space-y-3">
        {notifications.map((notification) => {
          const Icon = getNotificationIcon(notification.type);
          const style = getNotificationStyle(notification.type);

          return (
            <div
            key={notification.id}
            className={`pointer-events-auto overflow-hidden rounded-3xl border ${style.border} bg-white shadow-2xl`}
          >
              <div className="flex items-start gap-3 p-4">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-2xl ${style.iconWrap}`}
                >
                  <Icon className="size-5" />
                </span>

                <button
                  type="button"
                  onClick={() => {
                    router.push(notification.href);
                    removeNotification(notification.id);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-black text-neutral-950">
                    {notification.title}
                  </p>
                  <p className="mt-1 text-sm font-bold leading-6 text-neutral-600">
                    {notification.message}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => removeNotification(notification.id)}
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-500 transition hover:bg-neutral-200"
                  aria-label="Dismiss notification"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {lastRealtimeIssue ? (
        <button
          type="button"
          onClick={() => pushSystemNotification(lastRealtimeIssue)}
          className="pointer-events-auto max-w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-800 shadow-lg"
        >
          Realtime issue detected
        </button>
      ) : null}

      <div
  className="pointer-events-auto flex flex-wrap items-center justify-end gap-2 rounded-2xl bg-emerald-500 px-3 py-2 text-white shadow-2xl"
        title={`Kitchen: ${kitchenStatus}. Service: ${serviceStatus}. Operations: ${operationsStatus}.${
          lastRealtimeIssue ? ` Issue: ${lastRealtimeIssue}` : ''
        }`}
      >
        <button
          type="button"
          onClick={alertsEnabled ? disableAlerts : enableAlerts}
          className="inline-flex h-8 items-center gap-2 rounded-xl px-2 text-xs font-black transition hover:bg-white/15"
        >
          <Volume2 className="size-4" />
          {alertsEnabled ? 'Alerts On' : 'Enable Alerts'}
        </button>

        <span className="inline-flex h-7 items-center gap-1 rounded-xl bg-white/15 px-2 text-[11px] font-black">
          <RealtimeIcon className="size-3.5" />
          {realtimeStatusLabel}
        </span>

        <button
          type="button"
          onClick={pushTestNotification}
          className="inline-flex h-7 items-center gap-1 rounded-xl bg-white/15 px-2 text-[11px] font-black transition hover:bg-white/25"
        >
          Test Alert
        </button>

        {browserNotificationPermission === 'denied' ? (
          <span className="rounded-xl bg-red-500/25 px-2 py-1 text-[10px] font-black">
            Browser Blocked
          </span>
        ) : null}
      </div>
    </div>
  );
}