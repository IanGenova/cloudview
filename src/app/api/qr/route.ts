import QRCode from 'qrcode';

import { requireUser } from '@/lib/auth';
import { isNextRedirectError } from '@/lib/next-control-flow';

/**
 * A QR image for one of our own URLs.
 *
 * This was an unauthenticated GET that rendered any attacker-supplied http(s)
 * URL into a PNG served from the hotel's own domain with a day of cache. It
 * is also the only QR generator in the codebase and nothing calls it -- the
 * tags page shows a QrCode *icon* from lucide and tells staff they can reprint
 * the QR link, but renders no image.
 *
 * So rather than delete a documented feature, it is now what it claimed to be:
 * signed in, and only for this deployment's own origin.
 */
export async function GET(request: Request) {
  try {
    await requireUser();
  } catch (error) {
    if (isNextRedirectError(error)) {
      return new Response('Unauthorized', { status: 401 });
    }

    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('url') || '';

  let target: URL;

  try {
    target = new URL(raw);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return new Response('Invalid URL', { status: 400 });
  }

  /*
   * Our own host only. A QR code served from the hotel's domain carries the
   * hotel's authority: a guest scanning one has every reason to trust where it
   * goes, which is exactly why this must not point anywhere a caller likes.
   */
  const selfHost = new URL(request.url).host;

  if (target.host !== selfHost) {
    return new Response('URL must be on this site', { status: 400 });
  }

  const buffer = await QRCode.toBuffer(target.toString(), {
    type: 'png',
    width: 512,
    margin: 2,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'image/png',
      /* Private: it is generated for a signed-in operator, not the public. */
      'cache-control': 'private, max-age=86400',
    },
  });
}
