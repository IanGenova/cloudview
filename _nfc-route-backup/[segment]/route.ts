import type { NextRequest } from 'next/server';
import { GET as handleNfcLaunch } from '@/lib/nfc-launch-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Backward-compatible NFC URL:
 *
 * /n/HGDYHQ85?k=SECRET
 *
 * The shared folder name is "segment" because the same first URL segment
 * may represent a legacy tag code or a hotel slug.
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      segment: string;
    }>;
  }
) {
  const { segment } = await params;

  return handleNfcLaunch(request, {
    params: Promise.resolve({
      tagCode: segment,
    }),
  });
}
