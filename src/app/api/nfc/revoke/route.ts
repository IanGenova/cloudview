import { NextResponse } from 'next/server';
import {
  getNfcAccessCookieName,
  NFC_ACCESS_COOKIE,
} from '@/lib/nfc-security';
import {
  closeCurrentNfcGuestSessionIfNoPendingWork,
  getNfcGuestSessionCookieName,
} from '@/lib/nfc-guest-session';

export const dynamic = 'force-dynamic';

async function readBody(request: Request) {
  try {
    return (await request.json()) as {
      tagCode?: string;
    };
  } catch {
    return {};
  }
}

function clearCookie(response: NextResponse, name: string) {
  response.cookies.set(name, '', {
    path: '/',
    maxAge: 0,
  });
}

export async function POST(request: Request) {
  const body = await readBody(request);
  const tagCode = String(body.tagCode || '').trim();

  if (!tagCode) {
    return NextResponse.json(
      {
        error: 'tagCode is required.',
      },
      {
        status: 400,
      }
    );
  }

  const result = await closeCurrentNfcGuestSessionIfNoPendingWork(tagCode);

  const response = NextResponse.json({
    ok: true,
    ...result,
  });

  /**
   * Only clear cookies when the session is really closed.
   * If there are pending orders/requests, keep the cookies alive.
   */
  if (!result.keepSession) {
    clearCookie(response, getNfcGuestSessionCookieName(tagCode));
    clearCookie(response, getNfcAccessCookieName(tagCode));
    clearCookie(response, NFC_ACCESS_COOKIE);
  }

  return response;
}
