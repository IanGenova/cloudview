import { jwtVerify, type JWTPayload } from 'jose';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

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
    prefix: '/dashboard/settings/user-account',
    roles: ['SUPER_ADMIN', 'HOTEL_ADMIN'],
  },
  {
    prefix: '/dashboard/kitchen-display',
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

function dashboardHomeForRole(role: DashboardRole) {
  if (role === 'KITCHEN') {
    return '/dashboard/kitchen-display';
  }

  if (role === 'STAFF') {
    return '/dashboard/orders';
  }

  return '/dashboard';
}

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

  if (!next.startsWith('/dashboard')) {
    return dashboardHomeForRole(role);
  }

  if (next.startsWith('//')) {
    return dashboardHomeForRole(role);
  }

  if (next.includes('://')) {
    return dashboardHomeForRole(role);
  }

  if (next === '/dashboard/login') {
    return dashboardHomeForRole(role);
  }

  return next;
}

function shouldForceHttps(request: NextRequest) {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }

  const host = request.nextUrl.hostname;

  if (host === 'localhost' || host === '127.0.0.1') {
    return false;
  }

  const forwardedProto = request.headers.get('x-forwarded-proto');

  if (forwardedProto) {
    return forwardedProto !== 'https';
  }

  return request.nextUrl.protocol !== 'https:';
}

function applySecurityHeaders(response: NextResponse) {
  const isDev = process.env.NODE_ENV !== 'production';

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
    isDev
      ? "connect-src 'self' ws: wss: http: https:"
      : `connect-src 'self' https: wss://${process.env.NEXT_PUBLIC_LAN_IP || '192.168.0.130'}:8000 wss://localhost:8000`,
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    isDev ? '' : 'upgrade-insecure-requests',
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

  if (process.env.NODE_ENV === 'production') {
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
    const httpsUrl = request.nextUrl.clone();
    httpsUrl.protocol = 'https:';

    return NextResponse.redirect(httpsUrl, 308);
  }

  /*
    Important:
    Do not redirect or return JSON for Server Action POST requests here.
    Let the Server Action run and let your server actions protect themselves
    with requireUser() / requireRole().
  */
  if (isServerActionRequest(request)) {
    return applySecurityHeaders(NextResponse.next());
  }

  const session = await verifyDashboardSession(request);
  const isLoginPage = pathname === '/dashboard/login';

  if (isLoginPage) {
    if (session) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = getSafeNextPath(request, session.role);
      redirectUrl.search = '';

      return NextResponse.redirect(redirectUrl);
    }

    return applySecurityHeaders(NextResponse.next());
  }

  if (!session) {
    return NextResponse.redirect(createLoginRedirect(request));
  }

  if (!canAccessPath(pathname, session.role)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = dashboardHomeForRole(session.role);
    redirectUrl.search = '';

    return NextResponse.redirect(redirectUrl);
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/dashboard/:path*'],
};