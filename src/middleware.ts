import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/dashboard') && pathname !== '/dashboard/login') {
    const hasCookie = request.cookies.has(AUTH_COOKIE);
    if (!hasCookie) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/login';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*']
};
