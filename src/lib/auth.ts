import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import { Role } from '@prisma/client';
import { db } from '@/lib/db';

export const AUTH_COOKIE = 'cloudview_session';

type SessionPayload = {
  sub: string;
  email: string;
  role: Role;
  hotelId?: string | null;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is missing');
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secretKey());

  const jar = await cookies();
  jar.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(AUTH_COOKIE);
}

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const payload = await getSessionPayload();
  if (!payload?.sub) return null;
  const user = await db.user.findUnique({
    where: { id: payload.sub },
    include: { hotel: true }
  });
  if (!user?.isActive) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/dashboard/login');
  return user;
}

export function canManageHotel(role: Role) {
  return role === 'SUPER_ADMIN' || role === 'HOTEL_ADMIN';
}

export function requireRole(role: Role, allowed: Role[]) {
  if (!allowed.includes(role)) throw new Error('Forbidden');
}

export function dashboardHomeForRole(role: Role) {
  if (role === 'KITCHEN') return '/dashboard/kitchen';
  return '/dashboard';
}
