import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALLOWED_IMAGE_UPLOAD_TYPES,
  imageExtensionForUploadType,
} from './upload-file-type';

/*
 * What extension an uploaded image is stored under.
 *
 * The menu uploader took it from the client-supplied filename:
 *
 *   const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
 *
 * with the only content check being `allowedTypes.includes(file.type)` -- and
 * file.type is the multipart Content-Type header the client also writes. So a
 * part declaring `filename="x.html"; Content-Type: image/png` with a <script>
 * body was written as <slug>-<ts>.html, and the action returned the URL.
 *
 * That file is served from /uploads/, which the middleware matcher excludes
 * from the Content-Security-Policy and which nginx serves directly with only
 * nosniff. So it executed on the application's own origin, with no CSP, and an
 * admin who opened it had their session driven. .svg reached the same place
 * through the Next route's own content-type map.
 *
 * The extension therefore comes from the type we validated, never from the
 * name the client chose. Both sibling uploaders already did this; only the
 * menu one did not.
 */

test('each allowed image type maps to its own extension', () => {
  assert.equal(imageExtensionForUploadType('image/jpeg'), 'jpg');
  assert.equal(imageExtensionForUploadType('image/png'), 'png');
  assert.equal(imageExtensionForUploadType('image/webp'), 'webp');
  assert.equal(imageExtensionForUploadType('image/gif'), 'gif');
});

test('every allowed type has an extension', () => {
  for (const type of ALLOWED_IMAGE_UPLOAD_TYPES) {
    assert.notEqual(
      imageExtensionForUploadType(type),
      null,
      `${type} is allowed but has no extension`
    );
  }
});

/*
 * The attack, stated as a test: a declared image type can never produce a
 * markup or script extension, whatever the filename said.
 */
test('a scriptable extension is never produced', () => {
  const dangerous = ['html', 'htm', 'svg', 'xhtml', 'js', 'mjs', 'php'];

  for (const type of ALLOWED_IMAGE_UPLOAD_TYPES) {
    const extension = imageExtensionForUploadType(type);

    assert.equal(
      dangerous.includes(String(extension)),
      false,
      `${type} produced ${extension}`
    );
  }
});

test('svg is not an allowed upload type', () => {
  assert.equal(imageExtensionForUploadType('image/svg+xml'), null);
  assert.equal(
    (ALLOWED_IMAGE_UPLOAD_TYPES as readonly string[]).includes('image/svg+xml'),
    false
  );
});

test('text/html is refused however it is dressed up', () => {
  for (const type of [
    'text/html',
    'application/xhtml+xml',
    'image/png, text/html',
    'IMAGE/PNG',
    'image/png; charset=utf-8',
  ]) {
    assert.equal(
      imageExtensionForUploadType(type),
      null,
      `${JSON.stringify(type)} must not be accepted`
    );
  }
});

test('missing, empty and non-string types are refused', () => {
  for (const type of ['', ' ', null, undefined, 42, {}]) {
    assert.equal(
      imageExtensionForUploadType(type as never),
      null,
      JSON.stringify(type)
    );
  }
});
