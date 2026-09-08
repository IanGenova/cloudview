/**
 * Where to send a guest once their NFC tag has been accepted.
 *
 * This is its own module because the logic has broken twice in one day, both
 * times taking guest access down completely, and both times inside a route
 * handler too entangled to test:
 *
 *   1. Redirecting to the configured public origin while the access cookie was
 *      set on the origin the request arrived on. When those differed the cookie
 *      was dropped and the guest hit "Tap NFC Again" — and tapping again
 *      reproduced the mismatch exactly, so there was no way out of it.
 *
 *   2. Fixing that by using the request's own origin, which behind nginx is the
 *      internal address nginx dialled. Every production tap redirected guests
 *      to localhost:3000, where their own machine answered with an SSL error.
 *
 * The rule those two failures imply:
 *
 *   A forwarded host means a proxy is in front of us, and only that header
 *   knows where the browser is. Without one, the request URL is the address the
 *   browser used. Loopback is a real browser address in the second case and our
 *   own bind address in the first, so it is honoured only when nothing is
 *   proxying.
 *
 * Returns null when no usable origin can be derived, meaning the caller should
 * fall back to the configured public origin. Keeping that decision out of here
 * leaves this function free of environment and I/O, which is what makes it
 * testable — see nfc-redirect-origin.test.ts.
 */

/** Bind addresses that are never an address a browser can have used. */
const UNUSABLE_HOSTS = new Set([
  '0.0.0.0',
  '::',
  '[::]',
]);

/** Legitimate for a browser only when nothing is proxying in front of us. */
const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
]);

/**
 * X-Forwarded-* headers accumulate a comma-separated chain as a request passes
 * through proxies. The first entry is the one nearest the browser.
 */
function firstHeaderValue(value: string | null | undefined) {
  return value?.split(',')[0]?.trim() || '';
}

/** Strips the port and IPv6 brackets, and normalises case for comparison. */
function bareHostname(hostWithPort: string) {
  const withoutPort = hostWithPort.startsWith('[')
    ? hostWithPort.slice(0, hostWithPort.indexOf(']') + 1)
    : hostWithPort.split(':')[0];

  return withoutPort
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
}

export function resolveGuestRedirectOrigin(input: {
  requestUrl: string;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
}): string | null {
  const forwardedHost = firstHeaderValue(input.forwardedHost);

  if (forwardedHost) {
    const hostname = bareHostname(forwardedHost);

    /*
     * A proxy forwarding loopback or a bind address is misconfigured. The
     * configured public origin is a better answer than a redirect that no
     * guest can follow.
     */
    if (
      !hostname ||
      UNUSABLE_HOSTS.has(hostname) ||
      LOOPBACK_HOSTS.has(hostname)
    ) {
      return null;
    }

    const protocol =
      firstHeaderValue(input.forwardedProto).toLowerCase() === 'https'
        ? 'https'
        : 'http';

    try {
      return new URL(`${protocol}://${forwardedHost}`).origin;
    } catch {
      return null;
    }
  }

  /*
   * Nothing in front of us, so the request URL is the address the browser
   * used — localhost included. Staying on it is what keeps the access cookie
   * and the redirect on a single origin.
   */
  try {
    const requestUrl = new URL(input.requestUrl);
    const hostname = bareHostname(requestUrl.hostname);

    if (!hostname || UNUSABLE_HOSTS.has(hostname)) {
      return null;
    }

    return requestUrl.origin;
  } catch {
    return null;
  }
}
