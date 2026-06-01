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

function getCentrifugoUrl() {
  const explicitUrl = process.env.NEXT_PUBLIC_CENTRIFUGO_WS_URL;

  if (explicitUrl) {
    return normalizeCentrifugoUrl(explicitUrl);
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