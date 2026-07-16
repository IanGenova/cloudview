import type { NextRequest } from 'next/server';
import { GET as handleNfcLaunch } from '@/lib/nfc-launch-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Backward-compatible NFC URL:
 * /n/TAGCODE?k=SECRET
 */
export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{
      tagCode: string;
    }>;
  }
) {
  return handleNfcLaunch(request, context);
}
