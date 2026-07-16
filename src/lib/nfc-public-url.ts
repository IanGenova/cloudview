import 'server-only';

import { headers } from 'next/headers';

const CANONICAL_PRODUCTION_ORIGIN = 'https://careerinfoph.com';

const ALLOWED_PRODUCTION_HOSTS = new Set([
  'careerinfoph.com',
  'www.careerinfoph.com',
]);

function firstHeaderValue(value: string | null) {
  return value
    ?.split(',')[0]
    ?.trim() || '';
}

function normalizeOrigin(value: string) {
  const url = new URL(value);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Public application URL must use HTTP or HTTPS.');
  }

  return url.origin;
}

function resolveConfiguredProductionOrigin() {
  /*
   * PUBLIC_APP_URL and APP_URL are server-only runtime values.
   *
   * Do not use NEXT_PUBLIC_APP_URL here. NEXT_PUBLIC values are embedded
   * during next build and can preserve an old localhost value.
   */
  const configured =
    process.env.PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    CANONICAL_PRODUCTION_ORIGIN;

  try {
    const origin = normalizeOrigin(configured);
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();

    if (
      parsed.protocol === 'https:' &&
      ALLOWED_PRODUCTION_HOSTS.has(hostname)
    ) {
      /*
       * Use one canonical hostname so generated NFC cards remain stable even
       * when somebody accesses the dashboard through www.
       */
      return CANONICAL_PRODUCTION_ORIGIN;
    }
  } catch {
    // Fall through to the canonical production URL.
  }

  console.error(
    '[NFC URL] Invalid production origin detected. Using canonical origin.',
    {
      configuredOrigin: configured.replace(/[?#].*$/, ''),
    }
  );

  return CANONICAL_PRODUCTION_ORIGIN;
}

/**
 * Resolve the URL used in NFC links displayed by the dashboard.
 *
 * Production is locked to the canonical public CloudView domain.
 * Development uses the host through which the current request arrived.
 */
export async function resolveNfcPublicOrigin() {
  if (process.env.NODE_ENV === 'production') {
    return resolveConfiguredProductionOrigin();
  }

  const requestHeaders = await headers();

  const forwardedHost = firstHeaderValue(
    requestHeaders.get('x-forwarded-host')
  );
  const requestHost = firstHeaderValue(requestHeaders.get('host'));
  const host = forwardedHost || requestHost;

  const forwardedProtocol = firstHeaderValue(
    requestHeaders.get('x-forwarded-proto')
  ).toLowerCase();

  const protocol =
    forwardedProtocol === 'https'
      ? 'https'
      : 'http';

  if (host) {
    return `${protocol}://${host}`;
  }

  const configured =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'http://localhost:3000';

  return normalizeOrigin(configured);
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
  const origin = normalizeOrigin(input.origin);

  const hotelSlug = normalizeRequiredValue(
    input.hotelSlug,
    'Hotel slug'
  ).toLowerCase();

  const tagCode = normalizeRequiredValue(
    input.tagCode,
    'NFC tag code'
  );

  const scanSecret = String(input.scanSecret || '').trim();

  /*
   * Some existing or inactive NFC tags may not have a scan secret.
   * Do not generate an invalid secure URL for those records.
   */
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
  const origin = normalizeOrigin(input.origin);
  const tagCode = normalizeRequiredValue(
    input.tagCode,
    'NFC tag code'
  );

  return `${origin}/t/${encodeURIComponent(tagCode)}`;
}
