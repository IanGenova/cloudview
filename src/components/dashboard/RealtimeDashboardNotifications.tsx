'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BellRing,
  ChefHat,
  ConciergeBell,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createCentrifugoClient } from '@/lib/realtime/centrifugo-client';

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

type DashboardNotification = {
  id: string;
  type: 'ORDER' | 'SERVICE_REQUEST' | 'SYSTEM';
  title: string;
  message: string;
  href: string;
  createdAt: number;
};

type BrowserAudioContextConstructor = typeof AudioContext;

type RealtimeStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'disabled';

type RealtimeErrorContext = {
  error?: {
    code?: number;
    message?: string;
  };
  transport?: string;
  type?: string;
};

function createNotificationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeValue(value?: string | null) {
  return String(value ?? '').trim().toUpperCase();
}

function isKitchenOrderCreatedEvent(data: KitchenPayload) {
  const event = normalizeValue(data.event);
  const source = normalizeValue(data.source);
  const status = normalizeValue(data.status);

  if (event === 'KITCHEN-ORDER-CREATED') {
    return true;
  }

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
  const event = normalizeValue(data.event);
  const source = normalizeValue(data.source);
  const status = normalizeValue(data.status);

  if (event === 'SERVICE-REQUEST-CREATED') {
    return true;
  }

  if (
    (data.requestCode || data.requestId) &&
    (!status || status === 'PENDING') &&
    source !== 'DASHBOARD'
  ) {
    return true;
  }

  return false;
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

  const code = ctx.error?.code;
  const message = ctx.error?.message;
  const transport = ctx.transport;
  const type = ctx.type;

  return [
    code ? `code ${code}` : null,
    message ? message : null,
    transport ? `transport: ${transport}` : null,
    type ? `type: ${type}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function RealtimeDashboardNotifications() {
  const router = useRouter();

  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [notifications, setNotifications] = useState<DashboardNotification[]>(
    []
  );

  const [browserNotificationPermission, setBrowserNotificationPermission] =
    useState<NotificationPermission | 'unsupported'>('default');

  const [kitchenStatus, setKitchenStatus] =
    useState<RealtimeStatus>('connecting');

  const [serviceStatus, setServiceStatus] =
    useState<RealtimeStatus>('connecting');

  const [lastRealtimeIssue, setLastRealtimeIssue] = useState<string | null>(
    null
  );

  const alertsEnabledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recentEventKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    alertsEnabledRef.current = alertsEnabled;
  }, [alertsEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedValue = window.localStorage.getItem(
      'cloudview-dashboard-alerts-enabled'
    );

    if (storedValue === 'true') {
      setAlertsEnabled(true);
      alertsEnabledRef.current = true;
    }

    if (!('Notification' in window)) {
      setBrowserNotificationPermission('unsupported');
      return;
    }

    setBrowserNotificationPermission(Notification.permission);
  }, []);

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
    showBrowserNotification(notification);

    setNotifications((current) => [notification, ...current].slice(0, 6));

    window.setTimeout(() => {
      removeNotification(notification.id);
    }, 15_000);
  }

  function pushSystemNotification(message: string) {
    const notification: DashboardNotification = {
      id: createNotificationId(),
      type: 'SYSTEM',
      title: 'Dashboard Realtime',
      message,
      href: '/dashboard/kitchen',
      createdAt: Date.now(),
    };

    setNotifications((current) => [notification, ...current].slice(0, 6));

    window.setTimeout(() => {
      removeNotification(notification.id);
    }, 15_000);
  }

  function pushTestNotification() {
    const notification: DashboardNotification = {
      id: createNotificationId(),
      type: 'SYSTEM',
      title: 'Dashboard Alerts Test',
      message: 'Sound cue, in-app alert, and browser notification test.',
      href: '/dashboard/kitchen',
      createdAt: Date.now(),
    };

    void playNotificationSound(true);
    showBrowserNotification(notification);

    setNotifications((current) => [notification, ...current].slice(0, 6));

    window.setTimeout(() => {
      removeNotification(notification.id);
    }, 15_000);
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
            href: '/dashboard/kitchen',
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

    const subscriptions: Array<{
      unsubscribe: () => void;
    }> = [];

    function handleKitchenClientError(ctx: unknown) {
      const message = getRealtimeErrorMessage(ctx);

      if (isTransportClosedError(ctx)) {
        console.warn(
          'Kitchen realtime transport closed. Centrifugo is reachable but closed the WebSocket. Check WSS/TLS, allowed origins, token secret, and Centrifugo config.',
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
          'Service request realtime transport closed. Centrifugo is reachable but closed the WebSocket. Check WSS/TLS, allowed origins, token secret, and Centrifugo config.',
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

    async function connectKitchenNotifications() {
      setKitchenStatus('connecting');

      try {
        const response = await fetch('/api/realtime/kitchen-token', {
          cache: 'no-store',
        });

        if (!response.ok) {
          console.warn(
            `Unable to get kitchen realtime notification token. HTTP ${response.status}`
          );
          setKitchenStatus('error');
          setLastRealtimeIssue(
            `Kitchen token route failed. HTTP ${response.status}. Check /api/realtime/kitchen-token and CENTRIFUGO_TOKEN_HMAC_SECRET.`
          );
          return;
        }

        const payload = (await response.json()) as {
          token?: string;
          channels?: string[];
        };

        if (disposed) {
          return;
        }

        if (!payload.token) {
          console.warn('Kitchen realtime token route returned no token.');
          setKitchenStatus('error');
          setLastRealtimeIssue('Kitchen token route returned no token.');
          return;
        }

        if (!payload.channels?.length) {
          console.warn('Kitchen realtime token route returned no channels.');
          setKitchenStatus('disabled');
          setLastRealtimeIssue('Kitchen realtime returned no channels.');
          return;
        }

        kitchenCentrifuge = createCentrifugoClient(payload.token, {
                    tokenEndpoint: '/api/realtime/kitchen-token',
                    debugLabel: 'Kitchen realtime',
                  });

        if (!kitchenCentrifuge) {
          console.warn('Unable to create kitchen Centrifugo client.');
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

        for (const channelName of payload.channels) {
          const subscription = kitchenCentrifuge.newSubscription(channelName);

          subscription.on('publication', (ctx) => {
            const data = ctx.data as KitchenPayload;

            console.info('Kitchen realtime publication:', data);

            if (!isKitchenOrderCreatedEvent(data)) {
              return;
            }

            const orderKey = data.orderCode || createNotificationId();

            const eventKey = `order:${orderKey}:${
              data.updatedAt ?? data.status ?? data.source ?? ''
            }`;

            if (hasRecentlyHandled(eventKey)) {
              return;
            }

            pushNotification({
              id: createNotificationId(),
              type: 'ORDER',
              title: 'New Kitchen Order',
              message: data.orderCode
                ? `Order ${data.orderCode} was received${
                    data.source ? ` from ${data.source.replaceAll('_', ' ')}` : ''
                  }.`
                : 'A new kitchen order was received.',
              href: '/dashboard/kitchen',
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
          'Kitchen realtime setup failed. Check the token route and Centrifugo client configuration.'
        );
      }
    }

    async function connectServiceRequestNotifications() {
      setServiceStatus('connecting');

      try {
        const response = await fetch('/api/realtime/service-requests-token', {
          cache: 'no-store',
        });

        if (!response.ok) {
          console.warn(
            `Unable to get service request realtime notification token. HTTP ${response.status}`
          );
          setServiceStatus('error');
          setLastRealtimeIssue(
            `Service request token route failed. HTTP ${response.status}. Check /api/realtime/service-requests-token and CENTRIFUGO_TOKEN_HMAC_SECRET.`
          );
          return;
        }

        const payload = (await response.json()) as {
          token?: string;
          channels?: string[];
        };

        if (disposed) {
          return;
        }

        if (!payload.token) {
          console.warn('Service request realtime token route returned no token.');
          setServiceStatus('error');
          setLastRealtimeIssue('Service request token route returned no token.');
          return;
        }

        if (!payload.channels?.length) {
          console.warn(
            'Service request realtime token route returned no channels.'
          );
          setServiceStatus('disabled');
          setLastRealtimeIssue('Service request realtime returned no channels.');
          return;
        }

        serviceCentrifuge = createCentrifugoClient(payload.token, {
          tokenEndpoint: '/api/realtime/service-requests-token',
          debugLabel: 'Service request realtime',
        });

        if (!serviceCentrifuge) {
          console.warn('Unable to create service request Centrifugo client.');
          setServiceStatus('error');
          setLastRealtimeIssue(
            'Unable to create service request Centrifugo client.'
          );
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

        for (const channelName of payload.channels) {
          const subscription = serviceCentrifuge.newSubscription(channelName);

          subscription.on('publication', (ctx) => {
            const data = ctx.data as ServiceRequestPayload;

            console.info('Service request realtime publication:', data);

            if (!isServiceRequestCreatedEvent(data)) {
              return;
            }

            const requestKey =
              data.requestCode || data.requestId || createNotificationId();

            const eventKey = `service:${requestKey}:${
              data.updatedAt ?? data.status ?? data.source ?? ''
            }`;

            if (hasRecentlyHandled(eventKey)) {
              return;
            }

            pushNotification({
              id: createNotificationId(),
              type: 'SERVICE_REQUEST',
              title: 'New Guest Service Request',
              message: data.requestCode
                ? `Request ${data.requestCode} was received${
                    data.source ? ` from ${data.source.replaceAll('_', ' ')}` : ''
                  }.`
                : 'A new service request was received.',
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
        console.error('Service request notification realtime error:', error);
        setServiceStatus('error');
        setLastRealtimeIssue(
          'Service request realtime setup failed. Check the token route and Centrifugo client configuration.'
        );
      }
    }

    connectKitchenNotifications();
    connectServiceRequestNotifications();

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
    };
  }, [router]);

  const hasRealtimeError =
    kitchenStatus === 'error' || serviceStatus === 'error';

  const realtimeConnected =
    kitchenStatus === 'connected' || serviceStatus === 'connected';

  const realtimeConnecting =
    kitchenStatus === 'connecting' ||
    kitchenStatus === 'reconnecting' ||
    serviceStatus === 'connecting' ||
    serviceStatus === 'reconnecting';

  return (
    <>
      {!alertsEnabled ? (
        <button
          type="button"
          onClick={enableAlerts}
          className="fixed bottom-5 right-5 z-[80] inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-3 text-sm font-black text-white shadow-2xl transition hover:bg-neutral-800 dark:bg-gold dark:text-black dark:hover:bg-gold/80"
        >
          <Volume2 className="size-4" />
          Enable Alerts
        </button>
      ) : null}

      {alertsEnabled ? (
        <div className="fixed bottom-5 right-5 z-[80] flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500 px-3 py-2 text-sm font-black text-white shadow-2xl">
          <BellRing className="size-4" />
          Alerts On

          <span
            className={`inline-flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-black ${
              hasRealtimeError
                ? 'bg-red-500 text-white'
                : realtimeConnected
                  ? 'bg-white/20 text-white'
                  : realtimeConnecting
                    ? 'bg-amber-400 text-black'
                    : 'bg-neutral-900 text-white'
            }`}
            title={`Kitchen: ${kitchenStatus}. Service: ${serviceStatus}.${
              lastRealtimeIssue ? ` Issue: ${lastRealtimeIssue}` : ''
            }`}
          >
            {hasRealtimeError ? (
              <WifiOff className="size-3" />
            ) : (
              <Wifi className="size-3" />
            )}

            {hasRealtimeError
              ? 'Realtime Error'
              : realtimeConnected
                ? 'Live'
                : realtimeConnecting
                  ? 'Reconnecting'
                  : 'Realtime Off'}
          </span>

          <button
            type="button"
            onClick={pushTestNotification}
            className="inline-flex items-center gap-1 rounded-xl bg-white/20 px-2 py-1 text-xs font-black text-white transition hover:bg-white/30"
          >
            <Volume2 className="size-3" />
            Test Alert
          </button>
        </div>
      ) : null}

      <div className="fixed right-5 top-5 z-[90] w-[min(390px,calc(100vw-2rem))] space-y-3">
        {notifications.map((notification) => {
          const Icon =
            notification.type === 'ORDER'
              ? ChefHat
              : notification.type === 'SERVICE_REQUEST'
                ? ConciergeBell
                : BellRing;

          return (
            <div
              key={notification.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                removeNotification(notification.id);
                router.push(notification.href);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  removeNotification(notification.id);
                  router.push(notification.href);
                }
              }}
              className="cursor-pointer rounded-[1.5rem] border border-neutral-200 bg-white p-4 shadow-2xl transition hover:-translate-y-0.5 hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-950"
            >
              <div className="flex items-start gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold text-black">
                  <Icon className="size-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-black text-neutral-950 dark:text-white">
                    {notification.title}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-neutral-500 dark:text-neutral-400">
                    {notification.message}
                  </p>
                  <p className="mt-2 text-xs font-black text-gold">
                    Tap to open module
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    removeNotification(notification.id);
                  }}
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                  aria-label="Dismiss notification"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {alertsEnabled &&
      browserNotificationPermission !== 'granted' &&
      browserNotificationPermission !== 'unsupported' ? (
        <div className="fixed bottom-20 right-5 z-[80] max-w-sm rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800 shadow-xl dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          Browser push notifications are not granted yet. Sound and in-app
          alerts will still work.
        </div>
      ) : null}

      {alertsEnabled && browserNotificationPermission === 'unsupported' ? (
        <div className="fixed bottom-20 right-5 z-[80] max-w-sm rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800 shadow-xl dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          Browser push notifications require HTTPS for LAN IP access. Use{' '}
          <b>https://192.168.0.130:3000</b>. Sound and in-app alerts are still
          enabled.
        </div>
      ) : null}

      {alertsEnabled && lastRealtimeIssue ? (
        <div className="fixed bottom-36 right-5 z-[80] max-w-sm rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-800 shadow-xl dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
          <p className="font-black">Realtime diagnostic:</p>
          <p className="mt-1 leading-relaxed">{lastRealtimeIssue}</p>
        </div>
      ) : null}
    </>
  );
}