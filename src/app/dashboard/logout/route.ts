import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

function getSafeOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const hostHeader = request.headers.get('host');

  const protocol =
    forwardedProto || (process.env.NODE_ENV === 'production' ? 'https' : 'http');

  let host = forwardedHost || hostHeader || 'localhost:3000';

  // 0.0.0.0 is valid for binding a server, but invalid for browser navigation.
  if (host.startsWith('0.0.0.0')) {
    host = host.replace('0.0.0.0', 'localhost');
  }

  return `${protocol}://${host}`;
}

export async function GET(request: NextRequest) {
  const origin = getSafeOrigin(request);
  const loginUrl = new URL('/dashboard/login', origin);

  const response = NextResponse.redirect(loginUrl);

  response.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}