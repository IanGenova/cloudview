import { resolveGuestRedirectOrigin } from '@/lib/nfc-redirect-origin';

/**
 * Whether a request should be redirected to https.
 *
 * Its own module, tested, because this is the third time one mistake has
 * shipped. The first two were in the NFC launch handler and are pinned in
 * nfc-redirect-origin.test.ts. This is the same mistake in the middleware that
 * fronts every route, where it is worse: it took the entire application down
 * rather than one flow.
 *
 * The middleware read `request.nextUrl.hostname`. Under `next start -H
 * 0.0.0.0` -- what the project's own `npm run dev` binds to -- that is the bind address,
 * not the Host header the browser sent. `0.0.0.0` matched none of the
 * localhost / 10. / 192.168. / 172.16-31 exemptions, so every route on a plain
 * -HTTP deployment answered 308 -> https://0.0.0.0:PORT, an address that
 * resolves to nothing.
 *
 * Production survived only because nginx sets x-forwarded-proto: https, which
 * short-circuited the check before it could look at the host.
 *
 * So the question is always "where is the browser", never "what did we bind
 * to" -- and nfc-redirect-origin already answers exactly that, including the
 * proxy case. Reusing it keeps one answer in the codebase instead of three.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function isPrivateHostname(hostname: string) {
  if (LOOPBACK_HOSTNAMES.has(hostname)) {
    return true;
  }

  if (hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
    return true;
  }

  const private172 = hostname.match(/^172\.(\d{1,3})\./);

  if (!private172) {
    return false;
  }

  const secondOctet = Number(private172[1]);

  return secondOctet >= 16 && secondOctet <= 31;
}

export function shouldForceHttpsForRequest(input: {
  requestUrl: string;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  isProduction: boolean;
}) {
  if (!input.isProduction) {
    return false;
  }

  /*
   * Null means no usable browser-facing origin could be derived: a bind
   * address with nothing proxying, or a proxy forwarding its own loopback.
   * Either way we do not know where the browser is, and a redirect built on a
   * guess is precisely the outage this module exists to prevent. Declining to
   * redirect leaves the request working; guessing does not.
   */
  const origin = resolveGuestRedirectOrigin({
    requestUrl: input.requestUrl,
    forwardedHost: input.forwardedHost,
    forwardedProto: input.forwardedProto,
  });

  if (!origin) {
    return false;
  }

  let parsed: URL;

  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  /*
   * CloudView ships a LAN mode: a production build served over plain HTTP on a
   * private address so NFC phones on the hotel's wifi can reach it. Those
   * hosts have no certificate, so redirecting them to https is an outage.
   */
  if (isPrivateHostname(parsed.hostname.toLowerCase())) {
    return false;
  }

  /*
   * resolveGuestRedirectOrigin has already folded x-forwarded-proto into the
   * origin's scheme, so this one comparison covers both the direct case and
   * the terminated-at-the-proxy case.
   */
  return parsed.protocol !== 'https:';
}
