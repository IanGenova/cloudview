import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

export async function GET(request: Request) {
  const loginUrl = new URL('/dashboard/login', request.url);
  const response = NextResponse.redirect(loginUrl);

  response.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  });

  return response;
}