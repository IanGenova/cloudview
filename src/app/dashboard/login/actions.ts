'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import {
  createSession,
  dashboardHomeForRole,
  verifyPassword,
} from '@/lib/auth';
import { loginSchema } from '@/lib/validators';
import type { Role, User } from '@prisma/client';

export type LoginActionState =
  | {
      error?: string;
      success?: string;
    }
  | undefined;

function getSafeDashboardRedirect(
  nextValue: FormDataEntryValue | null,
  role: Role
) {
  const fallback = dashboardHomeForRole(role);

  if (typeof nextValue !== 'string') {
    return fallback;
  }

  const next = nextValue.trim();

  if (!next) {
    return fallback;
  }

  if (!next.startsWith('/dashboard')) {
    return fallback;
  }

  if (next.startsWith('//')) {
    return fallback;
  }

  if (next.includes('://')) {
    return fallback;
  }

  if (next === '/dashboard/login') {
    return fallback;
  }

  return next;
}

export async function loginAction(
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return {
      error: 'Enter a valid email and password.',
    };
  }

  const email = parsed.data.email.trim().toLowerCase();

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
      error:
        'Database connection failed. Check DATABASE_URL username, password, host, port, and database name.',
    };
  }

  if (!user || !user.isActive) {
    return {
      error: 'Invalid login credentials.',
    };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);

  if (!valid) {
    return {
      error: 'Invalid login credentials.',
    };
  }

  await createSession({
    sub: user.id,
    email: user.email,
    role: user.role,
    hotelId: user.hotelId,
    isActive: user.isActive,
  });

  const redirectTo = getSafeDashboardRedirect(formData.get('next'), user.role);

  redirect(redirectTo);
}