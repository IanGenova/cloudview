'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  BellRing,
  CheckCheck,
  ChefHat,
  ConciergeBell,
  PackageMinus,
  ShoppingBag,
  Trash2,
  Volume2,
  VolumeX,
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

const NOTIFICATION_STORAGE_KEY = 'cloudview-dashboard-notifications';
const SOUND_MUTED_STORAGE_KEY = 'cloudview-dashboard-sound-muted';
const MAX_STORED_NOTIFICATIONS = 50;
const MAX_CENTER_NOTIFICATIONS = 25;
const TOAST_VISIBLE_MS = 15_000;
const PERSISTED_POLL_MS = 30_000;
const EVENT_DEDUPE_TTL_MS = 30_000;


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
    | 'KITCHEN_ORDER'
    | 'SERVICE_REQUEST'
    | 'LOW_STOCK'
    | 'CANCELLED_ITEM'
    | 'SYSTEM';
  title: string;
  message: string;
  href: string;
  createdAt: number;
  readAt?: number | null;
  isPersisted?: boolean;
  dedupeKey?: string;
};

type PersistedDashboardNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  url: string | null;
  isRead: boolean;
  createdAt: string;
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


function notificationFingerprint(notification: DashboardNotification) {
  return [
    notification.type,
    notification.title,
    notification.message,
    notification.href,
  ]
    .map((part) => String(part ?? '').trim().toLowerCase())
    .join('|');
}

function getNotificationDedupeKey(notification: DashboardNotification) {
  return notification.dedupeKey || notificationFingerprint(notification);
}

function dedupeDashboardNotifications(items: DashboardNotification[]) {
  const map = new Map<string, DashboardNotification>();

  for (const item of items) {
    const key = getNotificationDedupeKey(item);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, item);
      continue;
    }

    const shouldReplace =
      item.createdAt > existing.createdAt ||
      (!item.readAt && Boolean(existing.readAt)) ||
      (item.isPersisted && !existing.isPersisted);

    if (shouldReplace) {
      map.set(key, {
        ...item,
        readAt: item.readAt ?? existing.readAt ?? null,
      });
    }
  }

  return Array.from(map.values());
}

function parseStoredNotifications(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => {
        return (
          item &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.message === 'string' &&
          typeof item.href === 'string' &&
          typeof item.createdAt === 'number'
        );
      })
      .map((item) => ({
        id: item.id,
        type: toDashboardNotificationType(String(item.type ?? 'SYSTEM')),
        title: item.title,
        message: item.message,
        href: item.href,
        createdAt: item.createdAt,
        readAt: item.readAt ?? null,
      })) as DashboardNotification[];
  } catch {
    return [];
  }
}

function formatNotificationTime(createdAt: number) {
  const diffMs = Date.now() - createdAt;
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) {
    return 'Just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(createdAt));
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
  if (type === 'KITCHEN_ORDER') {
    return ChefHat;
  }

  if (type === 'ORDER') {
    return ShoppingBag;
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
  if (type === 'KITCHEN_ORDER') {
    return {
      iconWrap: 'bg-orange-100 text-orange-700',
      border: 'border-orange-200',
    };
  }

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


function toDashboardNotificationType(
  value: string
): DashboardNotification['type'] {
  const normalizedType = normalizeValue(value);

  if (normalizedType.includes('KITCHEN')) {
    return 'KITCHEN_ORDER';
  }

  if (normalizedType.includes('LOW_STOCK')) {
    return 'LOW_STOCK';
  }

  if (
    normalizedType.includes('SERVICE_REQUEST') ||
    normalizedType.includes('SERVICE')
  ) {
    return 'SERVICE_REQUEST';
  }

  if (
    normalizedType.includes('CANCELLED') ||
    normalizedType.includes('CANCELED')
  ) {
    return 'CANCELLED_ITEM';
  }

  if (normalizedType.includes('ORDER')) {
    return 'ORDER';
  }

  return 'SYSTEM';
}

function mapPersistedDashboardNotification(
  notification: PersistedDashboardNotification
): DashboardNotification {
  return {
    id: notification.id,
    type: toDashboardNotificationType(notification.type),
    title: notification.title,
    message: notification.message,
    href: notification.url || '/dashboard',
    createdAt: Date.parse(notification.createdAt) || Date.now(),
    readAt: notification.isRead ? Date.now() : null,
    isPersisted: true,
    dedupeKey: notificationFingerprint({
      id: notification.id,
      type: toDashboardNotificationType(notification.type),
      title: notification.title,
      message: notification.message,
      href: notification.url || '/dashboard',
      createdAt: Date.parse(notification.createdAt) || Date.now(),
      readAt: notification.isRead ? Date.now() : null,
    }),
  };
}

export function RealtimeDashboardNotifications() {
  const router = useRouter();
  const notificationShellRef = useRef<HTMLDivElement | null>(null);

  const [notifications, setNotifications] = useState<DashboardNotification[]>(
    []
  );

  const [persistedNotifications, setPersistedNotifications] = useState<
    DashboardNotification[]
  >([]);

  const [persistedUnreadCount, setPersistedUnreadCount] = useState(0);

  const [toastNotificationIds, setToastNotificationIds] = useState<string[]>(
    []
  );

const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
const [notificationsLoaded, setNotificationsLoaded] = useState(false);

const [soundMuted, setSoundMuted] = useState(false);
const soundMutedRef = useRef(false);

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

    const savedNotifications = parseStoredNotifications(
      window.localStorage.getItem(NOTIFICATION_STORAGE_KEY)
    );

    setNotifications(savedNotifications.slice(0, MAX_STORED_NOTIFICATIONS));
    setNotificationsLoaded(true);

    const muted = window.localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === 'true';

    setSoundMuted(muted);
    soundMutedRef.current = muted;

    if (!canUseBrowserNotifications()) {
      setBrowserNotificationPermission('unsupported');
      return;
    }

    setBrowserNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    let disposed = false;

    async function fetchUnreadNotifications() {
      try {
        const response = await fetch('/api/dashboard/notifications', {
          cache: 'no-store',
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          ok: boolean;
          unreadCount: number;
          notifications: PersistedDashboardNotification[];
        };

        if (!data.ok || disposed) {
          return;
        }

        setPersistedUnreadCount(data.unreadCount);
        setPersistedNotifications(
          data.notifications.map(mapPersistedDashboardNotification)
        );
      } catch {
        // Realtime/local notifications can still work.
      }
    }

    void fetchUnreadNotifications();

    const intervalId = window.setInterval(() => {
      void fetchUnreadNotifications();
    }, PERSISTED_POLL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
  if (!notificationsLoaded) {
    return;
  }

  window.localStorage.setItem(
    NOTIFICATION_STORAGE_KEY,
    JSON.stringify(notifications.slice(0, MAX_STORED_NOTIFICATIONS))
  );
}, [notifications, notificationsLoaded]);

  function scheduleToastRemoval(id: string) {
  const timeoutId = window.setTimeout(() => {
    dismissToast(id);

    notificationTimeoutsRef.current = notificationTimeoutsRef.current.filter(
      (currentTimeoutId) => currentTimeoutId !== timeoutId
    );
  }, TOAST_VISIBLE_MS);

  notificationTimeoutsRef.current.push(timeoutId);
}

function dismissToast(id: string) {
  setToastNotificationIds((current) =>
    current.filter((notificationId) => notificationId !== id)
  );
}

async function markPersistedNotificationsRead({
  ids,
  all = false,
}: {
  ids?: string[];
  all?: boolean;
}) {
  try {
    await fetch('/api/dashboard/notifications/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        all
          ? {
              all: true,
            }
          : {
              ids: ids ?? [],
            }
      ),
    });
  } catch {
    // Silent fail. Local state is still updated for responsiveness.
  }
}

function removeNotification(id: string) {
  const isPersistedNotification = persistedNotifications.some(
    (notification) => notification.id === id
  );

  setNotifications((current) =>
    current.filter((notification) => notification.id !== id)
  );

  if (isPersistedNotification) {
    setPersistedNotifications((current) =>
      current.filter((notification) => notification.id !== id)
    );

    setPersistedUnreadCount((current) => Math.max(0, current - 1));

    void markPersistedNotificationsRead({ ids: [id] });
  }

  dismissToast(id);
}

function markNotificationRead(id: string) {
  const now = Date.now();
  const isPersistedNotification = persistedNotifications.some(
    (notification) => notification.id === id
  );

  setNotifications((current) =>
    current.map((notification) =>
      notification.id === id
        ? {
            ...notification,
            readAt: notification.readAt ?? now,
          }
        : notification
    )
  );

  if (isPersistedNotification) {
    setPersistedNotifications((current) =>
      current.filter((notification) => notification.id !== id)
    );

    setPersistedUnreadCount((current) => Math.max(0, current - 1));

    void markPersistedNotificationsRead({ ids: [id] });
  }
}

function markAllNotificationsRead() {
  const now = Date.now();

  setNotifications((current) =>
    current.map((notification) => ({
      ...notification,
      readAt: notification.readAt ?? now,
    }))
  );

  setPersistedNotifications([]);
  setPersistedUnreadCount(0);

  void markPersistedNotificationsRead({ all: true });
}

function clearNotifications() {
  setNotifications([]);
  setToastNotificationIds([]);
  setPersistedNotifications([]);
  setPersistedUnreadCount(0);

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(NOTIFICATION_STORAGE_KEY);
  }

  void markPersistedNotificationsRead({ all: true });
}

function toggleSoundMuted() {
  setSoundMuted((current) => {
    const next = !current;

    soundMutedRef.current = next;
    window.localStorage.setItem(SOUND_MUTED_STORAGE_KEY, String(next));

    return next;
  });
}


  async function playNotificationSound(force = false) {

      if (soundMutedRef.current) {
        return;
      }

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

function addNotificationToCenter({
  notification,
  playSoundCue = true,
  forceSoundCue = false,
  showBrowser = true,
  showToast = true,
}: {
  notification: DashboardNotification;
  playSoundCue?: boolean;
  forceSoundCue?: boolean;
  showBrowser?: boolean;
  showToast?: boolean;
}) {
  const normalizedNotification: DashboardNotification = {
    ...notification,
    readAt: notification.readAt ?? null,
  };

  if (playSoundCue) {
    void playNotificationSound(forceSoundCue);
  }

  if (showBrowser && alertsEnabledRef.current) {
    showBrowserNotification(normalizedNotification);
  }

  setNotifications((current) =>
    dedupeDashboardNotifications([
      normalizedNotification,
      ...current.filter((item) => item.id !== normalizedNotification.id),
    ]).slice(0, MAX_STORED_NOTIFICATIONS)
  );

  if (showToast) {
    setToastNotificationIds((current) => [
      normalizedNotification.id,
      ...current.filter((id) => id !== normalizedNotification.id),
    ].slice(0, 6));

    scheduleToastRemoval(normalizedNotification.id);
  }
}


function getKitchenNotificationHref(orderCode: string) {
  const query = new URLSearchParams({
    mode: 'rush',
    focusOrder: orderCode,
  });

  return `/dashboard/kitchen?${query.toString()}`;
}

function pushNotification(notification: DashboardNotification) {
  addNotificationToCenter({
    notification,
    playSoundCue: true,
    showBrowser: true,
    showToast: true,
  });
}

function pushSystemNotification(message: string) {
  const notification: DashboardNotification = {
    id: createNotificationId(),
    type: 'SYSTEM',
    title: 'Dashboard Realtime',
    message,
    href: '/dashboard/orders',
    createdAt: Date.now(),
    readAt: null,
  };

  addNotificationToCenter({
    notification,
    playSoundCue: false,
    showBrowser: false,
    showToast: true,
  });
}

function pushTestNotification() {
  const notification: DashboardNotification = {
    id: createNotificationId(),
    type: 'SYSTEM',
    title: 'Dashboard Alerts Test',
    message: 'Sound cue, in-app alert, and browser notification test.',
    href: '/dashboard/orders',
    createdAt: Date.now(),
    readAt: null,
  };

  addNotificationToCenter({
    notification,
    playSoundCue: true,
    forceSoundCue: true,
    showBrowser: true,
    showToast: true,
  });
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
            readAt: null,
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
    }, EVENT_DEDUPE_TTL_MS);

    return false;
  }

  useEffect(() => {
    if (!notificationCenterOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        notificationShellRef.current?.contains(target)
      ) {
        return;
      }

      setNotificationCenterOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNotificationCenterOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [notificationCenterOpen]);

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
        if (response.status === 401 || response.status === 403) {
          console.warn(
            `${label} realtime disabled. Token route returned HTTP ${response.status}.`
          );

          return {
            token: undefined,
            channels: [],
          };
        }

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

            const createdAt = Date.now();
            const orderMessage = `${orderCode} is waiting for order review.${
              data.paymentStatus ? ` Payment: ${data.paymentStatus}.` : ''
            }`;

            pushNotification({
              id: createNotificationId(),
              type: 'ORDER',
              title: 'New Food Order',
              message: orderMessage,
              href: '/dashboard/orders',
              createdAt,
              dedupeKey: `order-management:${orderCode}:${data.updatedAt ?? ''}`,
            });

            pushNotification({
              id: createNotificationId(),
              type: 'KITCHEN_ORDER',
              title: 'New Kitchen Ticket',
              message: `${orderCode} is ready for kitchen action. Open Rush Mode to accept and prepare it.`,
              href: getKitchenNotificationHref(orderCode),
              createdAt,
              dedupeKey: `kitchen-ticket:${orderCode}:${data.updatedAt ?? ''}`,
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
      for (const timeoutId of notificationTimeoutsRef.current) {
          window.clearTimeout(timeoutId);
        }

        notificationTimeoutsRef.current = [];
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

  const toastNotifications = notifications.filter((notification) =>
    toastNotificationIds.includes(notification.id)
  );

  const mergedNotifications = useMemo(() => {
    return dedupeDashboardNotifications([
      ...persistedNotifications,
      ...notifications,
    ]).sort((first, second) => second.createdAt - first.createdAt);
  }, [notifications, persistedNotifications]);

  const displayedPersistedUnreadCount = mergedNotifications.filter(
    (notification) => notification.isPersisted && !notification.readAt
  ).length;

  const hiddenPersistedUnreadCount = Math.max(
    0,
    persistedUnreadCount - displayedPersistedUnreadCount
  );

  const unreadCount =
    mergedNotifications.filter((notification) => !notification.readAt).length +
    hiddenPersistedUnreadCount;

  const latestNotifications = mergedNotifications.slice(
    0,
    MAX_CENTER_NOTIFICATIONS
  );

  const totalNotificationCount =
    mergedNotifications.length + hiddenPersistedUnreadCount;

  return (
    <>
      <div className="pointer-events-none fixed right-5 top-[5.25rem] z-[80] flex w-[calc(100vw-2.5rem)] max-w-md flex-col items-end gap-3">
        <div className="w-full space-y-3">
          {toastNotifications.map((notification) => {
            const Icon = getNotificationIcon(notification.type);
            const style = getNotificationStyle(notification.type);

            return (
              <div
                key={notification.id}
                className={`pointer-events-auto overflow-hidden rounded-3xl border ${style.border} bg-white shadow-2xl dark:bg-neutral-950`}
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
                      markNotificationRead(notification.id);
                      dismissToast(notification.id);
                      router.push(notification.href);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="text-sm font-black text-neutral-950 dark:text-white">
                      {notification.title}
                    </p>
                    <p className="mt-1 text-sm font-bold leading-6 text-neutral-600 dark:text-neutral-300">
                      {notification.message}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => dismissToast(notification.id)}
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-500 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    aria-label="Dismiss notification"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div ref={notificationShellRef} className="relative z-[110]">
        <button
          type="button"
          onClick={() => setNotificationCenterOpen((current) => !current)}
          aria-expanded={notificationCenterOpen}
          className={`relative inline-flex h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-black transition ${
            hasRealtimeError
              ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'
              : 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800'
          }`}
          title={`Kitchen: ${kitchenStatus}. Service: ${serviceStatus}. Operations: ${operationsStatus}.${
            lastRealtimeIssue ? ` Issue: ${lastRealtimeIssue}` : ''
          }`}
        >
          <BellRing className="size-4" />
          <span className="hidden sm:inline">Notifications</span>

          {unreadCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </button>

        {notificationCenterOpen ? (
          <div className="absolute right-0 top-full z-[120] mt-3 w-[28rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-2xl dark:border-neutral-800 dark:bg-neutral-950">
            <div className="border-b border-neutral-100 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-neutral-950 dark:text-white">
                    Notification Center
                  </p>
                  <p className="mt-1 text-xs font-bold text-neutral-500 dark:text-neutral-400">
                    {unreadCount} unread · {totalNotificationCount} total
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setNotificationCenterOpen(false)}
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-neutral-500 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  aria-label="Close notification center"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  disabled={!unreadCount}
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-xl bg-black px-2 text-[11px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
                >
                  <CheckCheck className="size-3.5" />
                  Read all
                </button>

                <button
                  type="button"
                  onClick={toggleSoundMuted}
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-neutral-200 bg-white px-2 text-[11px] font-black text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  {soundMuted ? (
                    <VolumeX className="size-3.5" />
                  ) : (
                    <Volume2 className="size-3.5" />
                  )}
                  {soundMuted ? 'Unmute' : 'Mute'}
                </button>

                <button
                  type="button"
                  onClick={clearNotifications}
                  disabled={!totalNotificationCount}
                  className="inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 text-[11px] font-black text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                >
                  <Trash2 className="size-3.5" />
                  Clear
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950">
                <button
                  type="button"
                  onClick={alertsEnabled ? disableAlerts : enableAlerts}
                  className="inline-flex h-8 items-center gap-2 rounded-xl px-2 text-xs font-black text-neutral-700 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <Volume2 className="size-4" />
                  {alertsEnabled ? 'Alerts On' : 'Enable Alerts'}
                </button>

                <span
                  className={`inline-flex h-8 items-center gap-1 rounded-xl px-2 text-[11px] font-black ${
                    realtimeConnected
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : hasRealtimeError
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
                  }`}
                >
                  <RealtimeIcon className="size-3.5" />
                  {realtimeStatusLabel}
                </span>

                <button
                  type="button"
                  onClick={pushTestNotification}
                  className="inline-flex h-8 items-center gap-1 rounded-xl bg-neutral-100 px-2 text-[11px] font-black text-neutral-700 transition hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  Test Alert
                </button>

                {browserNotificationPermission === 'denied' ? (
                  <span className="rounded-xl bg-red-500/10 px-2 py-1 text-[10px] font-black text-red-600 dark:text-red-300">
                    Browser Blocked
                  </span>
                ) : null}
              </div>

              {lastRealtimeIssue ? (
                <button
                  type="button"
                  onClick={() => pushSystemNotification(lastRealtimeIssue)}
                  className="mt-3 w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-left text-xs font-black text-amber-800 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                >
                  Realtime issue detected
                </button>
              ) : null}

              {persistedUnreadCount > 0 ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  <p className="font-black">Welcome back!</p>
                  <p>
                    You have {persistedUnreadCount} unread dashboard notification
                    {persistedUnreadCount === 1 ? '' : 's'} while you were away.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="max-h-[min(440px,calc(100dvh-240px))] overflow-y-auto p-3">
              {latestNotifications.length ? (
                <div className="space-y-2">
                  {latestNotifications.map((notification) => {
                    const Icon = getNotificationIcon(notification.type);
                    const style = getNotificationStyle(notification.type);
                    const isUnread = !notification.readAt;

                    return (
                      <div
                        key={`center-${notification.id}`}
                        className={`rounded-2xl border p-3 ${
                          isUnread
                            ? `${style.border} bg-neutral-50 dark:bg-neutral-900`
                            : 'border-neutral-100 bg-white opacity-75 dark:border-neutral-800 dark:bg-neutral-950'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`grid size-10 shrink-0 place-items-center rounded-2xl ${style.iconWrap}`}
                          >
                            <Icon className="size-5" />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-neutral-950 dark:text-white">
                                  {notification.title}
                                </p>
                                <p className="mt-0.5 text-[11px] font-bold text-neutral-400">
                                  {formatNotificationTime(notification.createdAt)}
                                </p>
                              </div>

                              {isUnread ? (
                                <span className="mt-1 size-2 shrink-0 rounded-full bg-emerald-500" />
                              ) : null}
                            </div>

                            <p className="mt-2 text-sm font-semibold leading-5 text-neutral-600 dark:text-neutral-300">
                              {notification.message}
                            </p>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  markNotificationRead(notification.id);
                                  setNotificationCenterOpen(false);
                                  router.push(notification.href);
                                }}
                                className="h-8 rounded-xl bg-black px-3 text-[11px] font-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                              >
                                View
                              </button>

                              {isUnread ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    markNotificationRead(notification.id)
                                  }
                                  className="h-8 rounded-xl border border-neutral-200 bg-white px-3 text-[11px] font-black text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-800"
                                >
                                  Mark read
                                </button>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => removeNotification(notification.id)}
                                className="h-8 rounded-xl border border-red-200 bg-red-50 px-3 text-[11px] font-black text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-neutral-200 p-8 text-center dark:border-neutral-800">
                  <BellRing className="mx-auto size-8 text-neutral-300 dark:text-neutral-700" />
                  <p className="mt-3 text-sm font-black text-neutral-500 dark:text-neutral-400">
                    No notifications yet
                  </p>
                  <p className="mt-1 text-xs font-semibold text-neutral-400 dark:text-neutral-500">
                    New orders, service requests, low stock, and cancellations will
                    appear here.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
