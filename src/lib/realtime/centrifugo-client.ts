'use client';

import { Centrifuge } from 'centrifuge';

type RealtimeTokenResponse = {
  token?: string;
  error?: string;
};

type CreateCentrifugoClientOptions = {
  tokenEndpoint?: string;
  debugLabel?: string;
};

function cleanPath(path: string) {
  if (!path) {
    return '/connection/websocket';
  }

  return path.startsWith('/') ? path : `/${path}`;
}

function normalizeCentrifugoUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);

    if (url.protocol === 'http:') {
      url.protocol = 'ws:';
    }

    if (url.protocol === 'https:') {
      url.protocol = 'wss:';
    }

    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      if (url.protocol === 'ws:') {
        console.warn(
          'Centrifugo URL was ws:// while the dashboard is HTTPS. Converting to wss:// automatically.'
        );

        url.protocol = 'wss:';
      }
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * `NEXT_PUBLIC_*` values are inlined at build time, so a bundle built for
 * production carries the production websocket host into every other
 * environment. Running that same build on a LAN address or on localhost then
 * tries to reach the production Centrifugo and silently fails forever.
 *
 * When the configured host does not match the host actually serving the page,
 * and the page is being served from localhost or a private LAN address, prefer
 * the current host and keep the configured port and path. Production, where the
 * hosts match, is unaffected.
 */
function adaptUrlToCurrentHost(rawUrl: string) {
  if (typeof window === 'undefined') {
    return rawUrl;
  }

  try {
    const configured = new URL(rawUrl);
    const currentHostname = window.location.hostname;

    if (configured.hostname === currentHostname) {
      return rawUrl;
    }

    const isLocalOrLan =
      currentHostname === 'localhost' ||
      currentHostname === '127.0.0.1' ||
      currentHostname.startsWith('192.168.') ||
      currentHostname.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(currentHostname);

    if (!isLocalOrLan) {
      return rawUrl;
    }

    configured.hostname = currentHostname;

    console.info(
      `Centrifugo host rewritten to ${currentHostname} because the build-time value (${
        new URL(rawUrl).hostname
      }) does not match the host serving this page.`
    );

    return configured.toString();
  } catch {
    return rawUrl;
  }
}

function getCentrifugoUrl() {
  const explicitUrl = process.env.NEXT_PUBLIC_CENTRIFUGO_WS_URL;

  if (explicitUrl) {
    return normalizeCentrifugoUrl(adaptUrlToCurrentHost(explicitUrl));
  }

  if (typeof window === 'undefined') {
    return 'ws://localhost:8000/connection/websocket';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  const host =
    process.env.NEXT_PUBLIC_CENTRIFUGO_HOST ||
    window.location.hostname ||
    'localhost';

  const port = process.env.NEXT_PUBLIC_CENTRIFUGO_PORT || '8000';

  const path = cleanPath(
    process.env.NEXT_PUBLIC_CENTRIFUGO_PATH || '/connection/websocket'
  );

  return `${protocol}//${host}:${port}${path}`;
}

function getSafeClientDiagnostics(url: string) {
  if (typeof window === 'undefined') {
    return {
      dashboardOrigin: 'server',
      dashboardProtocol: 'server',
      centrifugoUrl: url,
    };
  }

  return {
    dashboardOrigin: window.location.origin,
    dashboardProtocol: window.location.protocol,
    isSecureContext: window.isSecureContext,
    centrifugoUrl: url,
  };
}

async function fetchFreshRealtimeToken(tokenEndpoint: string) {
  const response = await fetch(tokenEndpoint, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error(
      `Unable to refresh Centrifugo token. ${tokenEndpoint} returned HTTP ${response.status}.`
    );
  }

  const payload = (await response.json()) as RealtimeTokenResponse;

  if (!payload.token) {
    throw new Error(
      `Unable to refresh Centrifugo token. ${tokenEndpoint} returned no token.`
    );
  }

  return payload.token;
}

/**
 * Options for a single channel subscription.
 *
 * Centrifugo runs with `allow_subscribe_for_client: false`, so every
 * subscription must carry a per-channel token minted by our token endpoint.
 * `getToken` lets the SDK re-fetch a fresh one when the current token expires,
 * so a long-lived dashboard does not silently stop receiving events.
 */
export function createSubscriptionOptions({
  channel,
  subscriptionTokens,
  tokenEndpoint,
}: {
  channel: string;
  subscriptionTokens?: Record<string, string>;
  tokenEndpoint?: string;
}) {
  const token = subscriptionTokens?.[channel];

  if (!token) {
    return undefined;
  }

  return {
    token,
    ...(tokenEndpoint
      ? {
          getToken: async () => {
            const response = await fetch(tokenEndpoint, {
              method: 'GET',
              cache: 'no-store',
              credentials: 'same-origin',
            });

            if (!response.ok) {
              throw new Error(
                `Unable to refresh subscription token for ${channel}. ${tokenEndpoint} returned HTTP ${response.status}.`
              );
            }

            const payload = (await response.json()) as {
              subscriptionTokens?: Record<string, string>;
            };

            const refreshed = payload.subscriptionTokens?.[channel];

            if (!refreshed) {
              throw new Error(
                `No subscription token returned for ${channel}. Access may have been revoked.`
              );
            }

            return refreshed;
          },
        }
      : {}),
  };
}

export function createCentrifugoClient(
  token: string,
  options: CreateCentrifugoClientOptions = {}
) {
  if (!token) {
    console.warn('Centrifugo client was not created because token is missing.');
    return null;
  }

  const url = getCentrifugoUrl();
  const debugLabel = options.debugLabel || 'Centrifugo';

  console.info(`${debugLabel} client diagnostics:`, getSafeClientDiagnostics(url));

  return new Centrifuge(url, {
    token,
    getToken: options.tokenEndpoint
      ? async () => {
          console.info(`${debugLabel} refreshing Centrifugo token.`);

          return fetchFreshRealtimeToken(options.tokenEndpoint!);
        }
      : undefined,
    debug: process.env.NODE_ENV !== 'production',
  });
}