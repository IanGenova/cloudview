/**
 * Where a tap may land inside the guest portal.
 *
 * A tap normally lands on the portal home. The dashboard's Hotel Guide needs
 * to land on the section a manager is editing, so the launch URL may carry
 * `to=guide/dining`. That is outside input on a redirect -- the classic
 * open-redirect hole -- so it is never treated as a URL: it is a short
 * relative path of lowercase segments under the tag's own portal, or it is
 * nothing and the tap lands on home as it always did.
 */

const SEGMENT = /^[a-z0-9-]+$/;
const MAX_SEGMENTS = 4;
const MAX_LENGTH = 120;

export function sanitizeGuestReturnPath(raw: string | null | undefined) {
  const trimmed = String(raw ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '');

  if (!trimmed || trimmed.length > MAX_LENGTH) {
    return null;
  }

  const segments = trimmed.split('/');

  if (segments.length > MAX_SEGMENTS) {
    return null;
  }

  if (!segments.every((segment) => SEGMENT.test(segment))) {
    return null;
  }

  return segments.join('/');
}

/*
 * The redirect target for an accepted tap. `nfcSession=1` is what the portal
 * reads to know it was just reached by a tap; it stays on both forms.
 */
export function guestLandingPath(
  tagCode: string,
  returnPath: string | null | undefined,
  extraQuery: Record<string, string> = {}
) {
  const query = new URLSearchParams({ nfcSession: '1', ...extraQuery });
  const safePath = sanitizeGuestReturnPath(returnPath);
  const base = `/t/${encodeURIComponent(tagCode)}`;

  return `${safePath ? `${base}/${safePath}` : base}?${query.toString()}`;
}

/*
 * The dashboard side: a launch URL (which already carries ?k=<secret>) with
 * the landing path added as `to`. An unusable path adds nothing, so the link
 * degrades to the plain tap rather than to a broken URL.
 */
export function withGuestReturnPath(launchUrl: string, returnPath: string) {
  const safePath = sanitizeGuestReturnPath(returnPath);

  if (!safePath) {
    return launchUrl;
  }

  try {
    const url = new URL(launchUrl);
    url.searchParams.set('to', safePath);
    return url.toString();
  } catch {
    return launchUrl;
  }
}
