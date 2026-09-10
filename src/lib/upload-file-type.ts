/**
 * What extension an uploaded image is stored under.
 *
 * The menu uploader derived it from the client-supplied filename:
 *
 *   const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
 *
 * while the only content check was `allowedTypes.includes(file.type)` -- and
 * `file.type` is the multipart Content-Type the same client writes. A part
 * declaring `filename="x.html"; Content-Type: image/png` with a script body
 * was written as `<slug>-<timestamp>.html`, and the action returned its URL.
 *
 * Uploads are served from /uploads/, which the middleware matcher excludes
 * from the Content-Security-Policy and which nginx serves directly with only
 * nosniff. So that file executed on the application's own origin with no CSP,
 * and any admin who opened it had their session driven.
 *
 * The extension therefore comes from the type we validated, never from the
 * name the client chose. An exact-match table, deliberately: no trimming, no
 * case folding, no parameter stripping. A Content-Type we do not recognise
 * exactly is one we decline to store, which is the safe direction.
 */

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/*
 * SVG is absent on purpose. It is an image to a designer and a document with
 * scripting to a browser, and /uploads/ has no CSP to contain it.
 */
export const ALLOWED_IMAGE_UPLOAD_TYPES = Object.keys(
  IMAGE_EXTENSIONS
) as ReadonlyArray<string>;

export function imageExtensionForUploadType(type: string): string | null {
  if (typeof type !== 'string') {
    return null;
  }

  return IMAGE_EXTENSIONS[type] ?? null;
}
