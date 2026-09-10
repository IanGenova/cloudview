import { jwtVerify, type JWTPayload } from 'jose';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, dashboardHomeForRole } from '@/lib/auth';
import { shouldForceHttpsForRequest } from '@/lib/https-redirect-policy';
import { resolveGuestRedirectOrigin } from '@/lib/nfc-redirect-origin';

type DashboardRole = 'SUPER_ADMIN' | 'HOTEL_ADMIN' | 'STAFF' | 'KITCHEN';

type DashboardSession = JWTPayload & {
  sub: string;
  role: DashboardRole;
  hotelId?: string | null;
  isActive?: boolean;
};

const routeRules: Array<{
  prefix: string;
  roles: DashboardRole[];
}> = [
  {
    prefix: '/dashboard/hotels',
    roles: ['SUPER_ADMIN'],
  },
  {
    prefix: '/dashboard/settings/users',
    roles: ['SUPER_ADMIN', 'HOTEL_ADMIN'],
  },
  {
    prefix: '/dashboard/settings/user-account',
    roles: ['SUPER_ADMIN', 'HOTEL_ADMIN'],
  },
  {
    prefix: '/dashboard/kitchen',
    roles: ['SUPER_ADMIN', 'HOTEL_ADMIN', 'KITCHEN'],
  },
  {
    prefix: '/dashboard/orders',
    roles: ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF', 'KITCHEN'],
  },
  {
    prefix: '/dashboard/service-requests',
    roles: ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF'],
  },
  {
    prefix: '/dashboard',
    roles: ['SUPER_ADMIN', 'HOTEL_ADMIN', 'STAFF', 'KITCHEN'],
  },
];

function isDashboardRole(value: unknown): value is DashboardRole {
  return (
    value === 'SUPER_ADMIN' ||
    value === 'HOTEL_ADMIN' ||
    value === 'STAFF' ||
    value === 'KITCHEN'
  );
}

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET must be set and must be at least 32 characters long.'
    );
  }

  return new TextEncoder().encode(secret);
}

function isServerActionRequest(request: NextRequest) {
  return request.method === 'POST' && request.headers.has('next-action');
}

function isDashboardPath(pathname: string) {
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
}

async function verifyDashboardSession(
  request: NextRequest
): Promise<DashboardSession | null> {
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
    });

    if (!payload.sub || !isDashboardRole(payload.role)) {
      return null;
    }

    if (payload.isActive === false) {
      return null;
    }

    return payload as DashboardSession;
  } catch {
    return null;
  }
}

/*
 * dashboardHomeForRole is imported from lib/auth rather than duplicated here.
 *
 * The copy that used to live in this file sent KITCHEN to
 * /dashboard/kitchen-display, a route that does not exist -- so a signed-in
 * kitchen user opening /dashboard/login, or any kitchen user clicking a module
 * they lack, was redirected to a 404. lib/auth's copy returned the correct
 * /dashboard/kitchen the whole time, which is exactly how two copies of one
 * rule fail.
 */

function getRequiredRoles(pathname: string) {
  return (
    routeRules.find((rule) => pathname.startsWith(rule.prefix))?.roles ?? []
  );
}

function canAccessPath(pathname: string, role: DashboardRole) {
  const allowedRoles = getRequiredRoles(pathname);

  if (!allowedRoles.length) {
    return true;
  }

  return allowedRoles.includes(role);
}

function createLoginRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();

  url.pathname = '/dashboard/login';
  url.search = '';
  url.searchParams.set(
    'next',
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );

  return url;
}

function getSafeNextPath(request: NextRequest, role: DashboardRole) {
  const next = request.nextUrl.searchParams.get('next');

  if (!next) {
    return dashboardHomeForRole(role);
  }

  /**
   * Only permit an internal dashboard path.
   *
   * `/dashboard-example` must not pass this check. It must be exactly
   * `/dashboard` or start with `/dashboard/`.
   */
  if (next !== '/dashboard' && !next.startsWith('/dashboard/')) {
    return dashboardHomeForRole(role);
  }

  if (next.startsWith('//') || next.includes('://')) {
    return dashboardHomeForRole(role);
  }

  if (
    next === '/dashboard/login' ||
    next.startsWith('/dashboard/login?') ||
    next.startsWith('/dashboard/login/')
  ) {
    return dashboardHomeForRole(role);
  }

  return next;
}

/**
 * Build a redirect from a safe path that may contain its own query string.
 *
 * Do not assign the complete value to `redirectUrl.pathname`.
 * Doing that turns:
 *
 *   /dashboard/pos?hotelId=123
 *
 * into:
 *
 *   /dashboard/pos%3FhotelId=123
 *
 * which is a different route and produces a 404.
 */
function createSafeNextRedirect(
  request: NextRequest,
  role: DashboardRole
) {
  const safeNext = getSafeNextPath(request, role);
  const parsedNext = new URL(safeNext, request.nextUrl.origin);
  const redirectUrl = request.nextUrl.clone();

  redirectUrl.pathname = parsedNext.pathname;
  redirectUrl.search = parsedNext.search;
  redirectUrl.hash = '';

  return redirectUrl;
}

/*
 * The decision lives in https-redirect-policy.ts, which is free of NextRequest
 * so it can be tested directly.
 *
 * This used to read request.nextUrl.hostname, which under `next start -H
 * 0.0.0.0` is the bind address rather than the Host header -- so 0.0.0.0
 * matched none of the private-range exemptions and every route answered
 * 308 -> https://0.0.0.0:PORT. Production never saw it because nginx sets
 * x-forwarded-proto and the check short-circuited above the host.
 */
function shouldForceHttps(request: NextRequest) {
  return shouldForceHttpsForRequest({
    requestUrl: request.url,
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
    isProduction: process.env.NODE_ENV === 'production',
  });
}

/**
 * Is this response actually being delivered over TLS?
 *
 * `NODE_ENV=production` does not imply HTTPS. CloudView ships a LAN mode where
 * a production build is served over plain HTTP on a private address so NFC
 * phones can reach it, and the guest portal explicitly supports that via
 * NEXT_PUBLIC_FORCE_HTTPS=false. The security policy has to follow the actual
 * transport, not the build mode.
 */
function isSecureRequest(request: NextRequest) {
  const forwardedProto = request.headers
    .get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();

  if (forwardedProto) {
    return forwardedProto === 'https';
  }

  return request.nextUrl.protocol === 'https:';
}

function applySecurityHeaders(response: NextResponse, request: NextRequest) {
  const isDev = process.env.NODE_ENV !== 'production';
  const secure = isSecureRequest(request);

  /**
   * Websocket scheme must match the page scheme.
   *
   * On an HTTPS page the browser only permits `wss:`, and `ws:` would be
   * blocked as mixed content anyway. On an HTTP page the reverse is true: the
   * realtime client connects with `ws:`, so a policy of `wss:` only silently
   * blocks every Centrifugo connection — which is what broke realtime in LAN
   * mode. Allowing `ws:` only while the page itself is already insecure adds
   * no downgrade risk.
   */
  const connectSrc = secure
    ? "connect-src 'self' https: wss:"
    : "connect-src 'self' http: https: ws: wss:";

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    isDev ? "connect-src 'self' ws: wss: http: https:" : connectSrc,
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    /*
      Only upgrade subresources when the page is already served over TLS.
      Emitting this on an HTTP LAN deployment rewrites same-origin requests to
      https:// against a host that has no certificate.
    */
    secure && !isDev ? 'upgrade-insecure-requests' : '',
  ]
    .filter(Boolean)
    .join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
  );

  /*
    HSTS pins the origin to HTTPS for two years. Sending it from a plain-HTTP
    LAN host is meaningless at best and, if that host is ever reached over a
    real domain, locks it out.
  */
  if (secure && !isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (shouldForceHttps(request)) {
    /*
      Built on the browser-facing origin, not on nextUrl. Flipping the
      protocol on nextUrl keeps whatever host we bound to, which is how the
      redirect target became https://0.0.0.0:PORT in the first place.
    */
    const browserOrigin = resolveGuestRedirectOrigin({
      requestUrl: request.url,
      forwardedHost: request.headers.get('x-forwarded-host'),
      forwardedProto: request.headers.get('x-forwarded-proto'),
    });

    const httpsUrl = new URL(
      request.nextUrl.pathname + request.nextUrl.search,
      browserOrigin ?? request.nextUrl.origin
    );
    httpsUrl.protocol = 'https:';

    return applySecurityHeaders(NextResponse.redirect(httpsUrl, 308), request);
  }

  /*
    Do not redirect or return JSON for Server Action POST requests here.
    Let each Server Action enforce requireUser() / requireRole().
  */
  if (isServerActionRequest(request)) {
    return applySecurityHeaders(NextResponse.next(), request);
  }

  /*
    Everything outside /dashboard — the guest portal, NFC launch routes, the
    marketing page and the API — still needs the security headers, but must not
    be pushed through dashboard session/role routing. The guest portal runs its
    own NFC session gate (requireNfcGuestAccess) and the API routes authorize
    themselves.
  */
  if (!isDashboardPath(pathname)) {
    return applySecurityHeaders(NextResponse.next(), request);
  }

  const session = await verifyDashboardSession(request);
  const isLoginPage = pathname === '/dashboard/login';

  if (isLoginPage) {
    if (session) {
      return applySecurityHeaders(
        NextResponse.redirect(createSafeNextRedirect(request, session.role)),
        request
      );
    }

    return applySecurityHeaders(NextResponse.next(), request);
  }

  if (!session) {
    return applySecurityHeaders(
      NextResponse.redirect(createLoginRedirect(request)),
      request
    );
  }

  if (!canAccessPath(pathname, session.role)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = dashboardHomeForRole(session.role);
    redirectUrl.search = '';

    return applySecurityHeaders(NextResponse.redirect(redirectUrl), request);
  }

  return applySecurityHeaders(NextResponse.next(), request);
}

export const config = {
  /**
   * Run on every route so the security headers (CSP, HSTS, frame-deny,
   * nosniff) also cover the guest portal, the NFC launch routes and the API —
   * not just /dashboard. Static assets and image optimizer output are excluded
   * because they are served from disk and do not need the header pass.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads/).*)'],
};
