import 'server-only';

import { headers } from 'next/headers';

const CANONICAL_PRODUCTION_ORIGIN =
  'https://cloudhotelph.com';

const UNSAFE_BROWSER_HOSTS = new Set([
  '0.0.0.0',
  '::',
  '[::]',
]);

const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);

function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() || '';
}

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function isPrivateLanHostname(hostnameInput: string) {
  const hostname = normalizeHostname(hostnameInput);

  return (
    LOOPBACK_HOSTS.has(hostname) ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function normalizeLanHost(value: string | undefined) {
  const raw = String(value || '').trim();

  if (!raw) {
    return null;
  }

  try {
    const parsed = raw.includes('://')
      ? new URL(raw)
      : new URL(`http://${raw}`);
    const hostname = normalizeHostname(parsed.hostname);

    if (!hostname || UNSAFE_BROWSER_HOSTS.has(hostname)) {
      return null;
    }

    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return null;
  }
}

function parseOrigin(value: string | undefined) {
  const raw = String(value || '').trim();

  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function configuredOriginCandidates() {
  const production = process.env.NODE_ENV === 'production';

  /*
   * NFC_PUBLIC_APP_URL is the dedicated override for NFC links.
   *
   * In development, NEXT_PUBLIC_APP_URL is preferred over APP_URL because
   * APP_URL may intentionally point to an ngrok callback while NFC tags must
   * open the LAN address (for example http://192.168.0.130:3000).
   *
   * In production, server-only values are preferred so a stale build-time
   * NEXT_PUBLIC_APP_URL cannot force NFC links back to localhost.
   */
  return production
    ? [
        process.env.NFC_PUBLIC_APP_URL,
        process.env.PUBLIC_APP_URL,
        process.env.APP_URL,
        process.env.NEXT_PUBLIC_APP_URL,
      ]
    : [
        process.env.NFC_PUBLIC_APP_URL,
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.PUBLIC_APP_URL,
        process.env.APP_URL,
      ];
}

function sanitizeConfiguredOrigin(url: URL) {
  const production = process.env.NODE_ENV === 'production';

  const lanHost = normalizeLanHost(
    process.env.NEXT_PUBLIC_LAN_IP
  );

  const hostname = normalizeHostname(url.hostname);

  /*
   * NFC_PUBLIC_APP_URL is an explicit administrator override.
   *
   * This allows a production-style local PM2 build to generate LAN URLs such
   * as http://192.168.0.130:3000 while the actual VPS uses the public domain.
   */
  const explicitNfcUrl = parseOrigin(
    process.env.NFC_PUBLIC_APP_URL
  );

  const isExplicitNfcOrigin =
    explicitNfcUrl?.origin === url.origin;

  /*
   * Never generate a browser URL containing 0.0.0.0.
   */
  if (UNSAFE_BROWSER_HOSTS.has(hostname)) {
    if (production) {
      return null;
    }

    url.hostname =
      lanHost?.split(':')[0] || 'localhost';

    if (lanHost?.includes(':')) {
      url.port = lanHost
        .split(':')
        .slice(1)
        .join(':');
    }
  }

  /*
   * Replace localhost with the configured LAN address during normal local
   * development.
   */
  if (
    !production &&
    LOOPBACK_HOSTS.has(
      normalizeHostname(url.hostname)
    ) &&
    lanHost
  ) {
    url.hostname = lanHost.split(':')[0];

    if (lanHost.includes(':')) {
      url.port = lanHost
        .split(':')
        .slice(1)
        .join(':');
    }
  }

  /*
   * Regular production URLs must be public HTTPS URLs.
   *
   * The explicit NFC_PUBLIC_APP_URL override is allowed to use a private LAN
   * address for local production-build testing.
   */
  if (production && !isExplicitNfcOrigin) {
    const productionHostname =
      normalizeHostname(url.hostname);

    if (
      UNSAFE_BROWSER_HOSTS.has(
        productionHostname
      ) ||
      isPrivateLanHostname(
        productionHostname
      )
    ) {
      return null;
    }

    url.protocol = 'https:';
    url.port = '';
  }

  url.pathname = '';
  url.search = '';
  url.hash = '';

  return url.origin;
}

function readConfiguredNfcOrigin() {
  for (const candidate of configuredOriginCandidates()) {
    const parsed = parseOrigin(candidate);

    if (!parsed) {
      continue;
    }

    const origin = sanitizeConfiguredOrigin(parsed);

    if (origin) {
      return origin;
    }
  }

  return null;
}

/**
 * Synchronous origin resolver for server utilities and route redirects.
 */
export function resolveConfiguredNfcPublicOrigin() {
  const configured = readConfiguredNfcOrigin();

  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    return CANONICAL_PRODUCTION_ORIGIN;
  }

  const lanHost = normalizeLanHost(process.env.NEXT_PUBLIC_LAN_IP);

  return lanHost ? `http://${lanHost}` : 'http://localhost:3000';
}

/**
 * Origin resolver for the NFC dashboard.
 *
 * Explicit environment configuration wins. Request headers are only a
 * fallback, which prevents a development server bound to 0.0.0.0 from
 * generating unusable http://0.0.0.0:3000 links.
 */
export async function resolveNfcPublicOrigin() {
  const configured = readConfiguredNfcOrigin();

  if (configured) {
    return configured;
  }

  const requestHeaders = await headers();
  const forwardedHost = firstHeaderValue(
    requestHeaders.get('x-forwarded-host')
  );
  const requestHost = firstHeaderValue(requestHeaders.get('host'));
  const rawHost = forwardedHost || requestHost;
  const forwardedProtocol = firstHeaderValue(
    requestHeaders.get('x-forwarded-proto')
  ).toLowerCase();

  if (rawHost) {
    try {
      const protocol = forwardedProtocol === 'https' ? 'https' : 'http';
      const requestUrl = new URL(`${protocol}://${rawHost}`);
      const hostname = normalizeHostname(requestUrl.hostname);
      const lanHost = normalizeLanHost(process.env.NEXT_PUBLIC_LAN_IP);

      if (UNSAFE_BROWSER_HOSTS.has(hostname)) {
        if (lanHost) {
          return `http://${lanHost}`;
        }

        return 'http://localhost:3000';
      }

      if (process.env.NODE_ENV === 'production') {
        if (isPrivateLanHostname(hostname)) {
          return CANONICAL_PRODUCTION_ORIGIN;
        }

        requestUrl.protocol = 'https:';
        requestUrl.port = '';
      }

      return requestUrl.origin;
    } catch {
      // Use the safe configured fallback below.
    }
  }

  return resolveConfiguredNfcPublicOrigin();
}

function normalizeRequiredValue(
  value: string | null | undefined,
  fieldName: string
) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required to generate an NFC URL.`);
  }

  return normalized;
}

export function buildSecureNfcLaunchUrl(input: {
  origin: string;
  hotelSlug: string;
  tagCode: string;
  scanSecret?: string | null;
}) {
  const parsedOrigin = parseOrigin(input.origin);

  if (!parsedOrigin) {
    throw new Error('A valid NFC public origin is required.');
  }

  const origin = sanitizeConfiguredOrigin(parsedOrigin);

  if (!origin) {
    throw new Error('The NFC public origin is not safe for browser links.');
  }

  const hotelSlug = normalizeRequiredValue(
    input.hotelSlug,
    'Hotel slug'
  ).toLowerCase();
  const tagCode = normalizeRequiredValue(input.tagCode, 'NFC tag code');
  const scanSecret = String(input.scanSecret || '').trim();

  if (!scanSecret) {
    return '';
  }

  return (
    `${origin}/n/${encodeURIComponent(hotelSlug)}` +
    `/${encodeURIComponent(tagCode)}` +
    `?k=${encodeURIComponent(scanSecret)}`
  );
}

export function buildProtectedGuestUrl(input: {
  origin: string;
  tagCode: string;
}) {
  const parsedOrigin = parseOrigin(input.origin);

  if (!parsedOrigin) {
    throw new Error('A valid NFC public origin is required.');
  }

  const origin = sanitizeConfiguredOrigin(parsedOrigin);

  if (!origin) {
    throw new Error('The NFC public origin is not safe for browser links.');
  }

  const tagCode = normalizeRequiredValue(input.tagCode, 'NFC tag code');

  return `${origin}/t/${encodeURIComponent(tagCode)}`;
}
