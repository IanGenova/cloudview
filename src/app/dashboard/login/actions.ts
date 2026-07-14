'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { createSession, dashboardHomeForRole, verifyPassword } from '@/lib/auth';
import {
  getFirstVisibleDashboardHref,
  getVisibleDashboardNavItems,
} from '@/lib/dashboard-permissions';
import type { Role, User } from '@prisma/client';

export type LoginActionState =
  | {
      error?: string;
      success?: string;
    }
  | undefined;

const DEMO_ACCOUNT_EMAILS = new Set([
  'admin@cloudview.test',
  'hoteladmin@cloudview.test',
  'staff@cloudview.test',
  'kitchen@cloudview.test',
]);

function cleanText(value: FormDataEntryValue | null, maxLength = 300) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseSafeDashboardRedirect(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const rawNext = value.trim();

  if (!rawNext || rawNext.startsWith('//') || rawNext.includes('://')) {
    return null;
  }

  try {
    const url = new URL(rawNext, 'http://cloudview.local');

    if (!url.pathname.startsWith('/dashboard')) {
      return null;
    }

    if (url.pathname === '/dashboard/login') {
      return null;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function isRouteWithinNavHref(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

async function getPermissionAwareDashboardRedirect({
  nextValue,
  user,
}: {
  nextValue: FormDataEntryValue | null;
  user: User;
}) {
  const firstVisibleHref = await getFirstVisibleDashboardHref(
    user.id,
    user.role
  );
  const fallback = firstVisibleHref ?? dashboardHomeForRole(user.role);
  const safeNext = parseSafeDashboardRedirect(nextValue);

  if (!safeNext) {
    return fallback;
  }

  const nextUrl = new URL(safeNext, 'http://cloudview.local');
  const visibleNavItems = await getVisibleDashboardNavItems(user.id, user.role);
  const canOpenRequestedModule = visibleNavItems.some((item) =>
    isRouteWithinNavHref(nextUrl.pathname, item.href)
  );

  return canOpenRequestedModule ? safeNext : fallback;
}

function loginErrorUrl(message: string) {
  const params = new URLSearchParams({
    error: message,
  });

  return `/dashboard/login?${params.toString()}`;
}

type LoginResult =
  | {
      ok: true;
      user: User;
      redirectTo: string;
    }
  | {
      ok: false;
      error: string;
    };

async function authenticateDashboardLogin(
  formData: FormData
): Promise<LoginResult> {
  const demoAccount = cleanText(formData.get('demoAccount'), 180).toLowerCase();
  const isDemoLogin = DEMO_ACCOUNT_EMAILS.has(demoAccount);

  const email = (isDemoLogin
    ? demoAccount
    : cleanText(formData.get('email'), 180)
  ).toLowerCase();

  const password = isDemoLogin
    ? '12345'
    : cleanText(formData.get('password'), 300);

  if (!email || !isValidEmail(email) || !password) {
    return {
      ok: false,
      error: 'Enter a valid email and password.',
    };
  }

  let user: User | null = null;

  try {
    user = await db.user.findUnique({
      where: {
        email,
      },
    });
  } catch (error) {
    console.error('Login database lookup failed:', error);

    return {
      ok: false,
      error:
        'Database connection failed. Check DATABASE_URL username, password, host, port, and database name.',
    };
  }

  if (!user || !user.isActive) {
    return {
      ok: false,
      error: 'Invalid login credentials.',
    };
  }

  const valid = await verifyPassword(password, user.passwordHash);

  if (!valid) {
    return {
      ok: false,
      error: 'Invalid login credentials.',
    };
  }

  return {
    ok: true,
    user,
    redirectTo: await getPermissionAwareDashboardRedirect({
      nextValue: formData.get('next'),
      user,
    }),
  };
}

/**
 * Client-enhanced login form action.
 * Kept for LoginForm.tsx if you still want the client version.
 */
export async function loginAction(
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const result = await authenticateDashboardLogin(formData);

  if (!result.ok) {
    return {
      error: result.error,
    };
  }

  await createSession({
    sub: result.user.id,
    email: result.user.email,
    role: result.user.role,
    hotelId: result.user.hotelId,
    isActive: result.user.isActive,
    authVersion: result.user.authVersion,
  });

  redirect(result.redirectTo);
}

/**
 * Server-only fallback action.
 * Use this directly from page.tsx to avoid Turbopack client chunk errors
 * on the login page.
 */
export async function loginDirectAction(formData: FormData) {
  const result = await authenticateDashboardLogin(formData);

  if (!result.ok) {
    redirect(loginErrorUrl(result.error));
  }

  await createSession({
    sub: result.user.id,
    email: result.user.email,
    role: result.user.role,
    hotelId: result.user.hotelId,
    isActive: result.user.isActive,
    authVersion: result.user.authVersion,
  });

  redirect(result.redirectTo);
}
