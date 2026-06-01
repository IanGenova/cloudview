import { NextResponse } from 'next/server';
import { getCurrentNfcGuestSessionStatus } from '@/lib/nfc-guest-session';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tagCode = url.searchParams.get('tagCode') || '';

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

  const status = await getCurrentNfcGuestSessionStatus(tagCode);

  return NextResponse.json({
    hasSession: status.hasSession,
    keepSession: status.keepSession,
    pendingOrders: status.pendingOrders,
    pendingServiceRequests: status.pendingServiceRequests,
    totalPending: status.totalPending,
  });
}