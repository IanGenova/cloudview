'use server';

import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import {
  createSession,
  dashboardHomeForRole,
  verifyPassword,
} from '@/lib/auth';
import { loginSchema } from '@/lib/validators';
import type { User } from '@prisma/client';

export type LoginActionState =
  | {
      error?: string;
      success?: string;
    }
  | undefined;

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

  let user: User | null = null;

  try {
    user = await db.user.findUnique({
      where: {
        email: parsed.data.email,
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
  });

  redirect(dashboardHomeForRole(user.role));
}