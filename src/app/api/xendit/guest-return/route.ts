import { NextRequest, NextResponse } from 'next/server';
import {
  buildGuestPaymentDestinationUrl,
  type GuestReturnFlow,
  type GuestReturnResult,
} from '@/lib/xendit-guest-return';

const VALID_FLOWS = new Set<GuestReturnFlow>(['food', 'service']);
const VALID_RESULTS = new Set<GuestReturnResult>([
  'success',
  'cancelled',
  'failed',
]);

export async function GET(request: NextRequest) {
  const tagCode = request.nextUrl.searchParams.get('tag')?.trim() || '';
  const sessionId = request.nextUrl.searchParams.get('session')?.trim() || '';
  const flow = request.nextUrl.searchParams.get('flow')?.trim() || '';
  const result = request.nextUrl.searchParams.get('result')?.trim() || '';

  if (
    !tagCode ||
    !sessionId ||
    !VALID_FLOWS.has(flow as GuestReturnFlow) ||
    !VALID_RESULTS.has(result as GuestReturnResult)
  ) {
    return NextResponse.json(
      { error: 'Invalid Xendit guest return parameters.' },
      { status: 400 }
    );
  }

  try {
    const destination = buildGuestPaymentDestinationUrl({
      tagCode,
      sessionId,
      flow: flow as GuestReturnFlow,
      result: result as GuestReturnResult,
    });

    return NextResponse.redirect(destination, 303);
  } catch (error) {
    console.error('[Xendit Guest Return] Redirect failed.', error);

    return NextResponse.json(
      { error: 'Guest return URL is not configured correctly.' },
      { status: 500 }
    );
  }
}
