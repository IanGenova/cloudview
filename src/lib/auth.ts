import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { db } from '@/lib/db';

export const AUTH_COOKIE = 'cloudview_dashboard_session';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

type SessionInput = {
  sub: string;
  email: string;
  role: Role;
  hotelId?: string | null;
  isActive?: boolean;
};

type SessionPayload = {
  sub: string;
  email: string;
  role: Role;
  hotelId: string | null;
  isActive: boolean;
};

function getAuthSecretKey() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET must be set and should be at least 32 characters long.'
    );
  }

  return new TextEncoder().encode(secret);
}

function isValidRole(value: unknown): value is Role {
  return (
    value === Role.SUPER_ADMIN ||
    value === Role.HOTEL_ADMIN ||
    value === Role.STAFF ||
    value === Role.KITCHEN
  );
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function dashboardHomeForRole(role: Role) {
  if (role === Role.KITCHEN) {
    return '/dashboard/kitchen-display';
  }

  if (role === Role.STAFF) {
    return '/dashboard/orders';
  }

  return '/dashboard';
}

export async function createSession(input: SessionInput) {
  const token = await new SignJWT({
    email: input.email,
    role: input.role,
    hotelId: input.hotelId ?? null,
    isActive: input.isActive ?? true,
  })
    .setProtectedHeader({
      alg: 'HS256',
      typ: 'JWT',
    })
    .setSubject(input.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS)
    .sign(getAuthSecretKey());

  const cookieStore = await cookies();

  cookieStore.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getAuthSecretKey(), {
      algorithms: ['HS256'],
    });

    if (!payload.sub || typeof payload.email !== 'string') {
      return null;
    }

    if (!isValidRole(payload.role)) {
      return null;
    }

    if (payload.isActive === false) {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      hotelId: typeof payload.hotelId === 'string' ? payload.hotelId : null,
      isActive: payload.isActive !== false,
    };
  } catch {
    return null;
  }
}

export async function destroySession() {
  const cookieStore = await cookies();

  cookieStore.set(AUTH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
}

export async function getCurrentUser() {
  const session = await getSessionPayload();

  if (!session) {
    return null;
  }

  const user = await db.user.findUnique({
    where: {
      id: session.sub,
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/dashboard/login');
  }

  return user;
}

export function requireRole(currentRole: Role, allowedRoles: Role[] | string[]) {
  if (!allowedRoles.includes(currentRole)) {
    throw new Error('Forbidden');
  }
}