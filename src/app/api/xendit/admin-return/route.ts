import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type AdminReturnTarget = 'pos' | 'guest-stay';

const TARGET_PATHS: Record<AdminReturnTarget, string> = {
  pos: '/xendit/pos-return',
  'guest-stay': '/xendit/guest-stay-return',
};

function isAdminReturnTarget(value: string | null): value is AdminReturnTarget {
  return value === 'pos' || value === 'guest-stay';
}

function isPrivateLanHostname(hostname: string) {
  const host = hostname.trim().toLowerCase();

  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function getLocalApplicationOrigin() {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!value) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL is required for the local Xendit return bridge.'
    );
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL must be an absolute HTTP or HTTPS URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_APP_URL must use HTTP or HTTPS.');
  }

  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol !== 'https:' &&
    !isPrivateLanHostname(url.hostname)
  ) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL must use HTTPS unless it points to a private LAN host.'
    );
  }

  return url.origin;
}

function noStore(response: NextResponse) {
  response.headers.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
  );
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');

  return response;
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('target');
  const state = request.nextUrl.searchParams.get('state')?.trim() ?? '';

  if (!isAdminReturnTarget(target) || !state || state.length > 8192) {
    return noStore(
      NextResponse.json(
        { error: 'Invalid Xendit administrator return parameters.' },
        { status: 400 }
      )
    );
  }

  let localOrigin: string;

  try {
    localOrigin = getLocalApplicationOrigin();
  } catch (error) {
    return noStore(
      NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'The local CloudView application URL is not configured.',
        },
        { status: 500 }
      )
    );
  }

  const destination = new URL(TARGET_PATHS[target], `${localOrigin}/`);
  destination.searchParams.set('state', state);

  return noStore(NextResponse.redirect(destination, 303));
}
