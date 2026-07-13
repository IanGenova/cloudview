import { NextRequest, NextResponse } from 'next/server';

const VALID_FLOWS = new Set(['food', 'service']);
const VALID_RESULTS = new Set(['success', 'cancelled', 'failed']);

function getGuestAppUrl() {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!value) {
    throw new Error('NEXT_PUBLIC_APP_URL is not configured.');
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL must be an absolute URL.');
  }

  return url;
}

export async function GET(request: NextRequest) {
  const tagCode = request.nextUrl.searchParams.get('tag')?.trim();
  const sessionId = request.nextUrl.searchParams.get('session')?.trim();
  const flow = request.nextUrl.searchParams.get('flow')?.trim();
  const result = request.nextUrl.searchParams.get('result')?.trim();

  if (
    !tagCode ||
    !sessionId ||
    !flow ||
    !result ||
    !VALID_FLOWS.has(flow) ||
    !VALID_RESULTS.has(result)
  ) {
    return NextResponse.json(
      {
        error: 'Invalid Xendit return parameters.',
      },
      {
        status: 400,
      }
    );
  }

  const guestAppUrl = getGuestAppUrl();

  const destination = new URL(
    `/t/${encodeURIComponent(tagCode)}/payment`,
    guestAppUrl
  );

  destination.searchParams.set('session', sessionId);
  destination.searchParams.set('flow', flow);
  destination.searchParams.set('result', result);

  return NextResponse.redirect(destination, 303);
}