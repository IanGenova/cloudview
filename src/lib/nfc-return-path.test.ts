import assert from 'node:assert/strict';
import test from 'node:test';

import {
  guestLandingPath,
  sanitizeGuestReturnPath,
  withGuestReturnPath,
} from './nfc-return-path';

/*
 * Where a tap may land inside the guest portal.
 *
 * The dashboard's Hotel Guide had no way to see a change as a guest sees it:
 * a manager had to walk to a physical tag, tap it, and navigate to the guide.
 * The "Open in guest portal" link fixes that by tapping the hotel's own public
 * tag URL and asking to land on the section being edited: /n/<CODE>?k=..&to=guide/dining.
 *
 * `to` is outside input on a redirect, which is the classic open-redirect
 * hole. So it is not a URL and never becomes one: a short relative path of
 * lowercase segments, or nothing. Anything else lands on the portal home,
 * exactly as before this existed.
 */

test('a guide section path is accepted as-is', () => {
  assert.equal(sanitizeGuestReturnPath('guide/dining'), 'guide/dining');
  assert.equal(sanitizeGuestReturnPath('guide/hotel-information'), 'guide/hotel-information');
  assert.equal(sanitizeGuestReturnPath('menu'), 'menu');
});

test('leading and trailing slashes and whitespace are tolerated, not kept', () => {
  assert.equal(sanitizeGuestReturnPath(' /guide/dining/ '), 'guide/dining');
});

test('nothing, or anything that is not a plain relative path, lands on home', () => {
  for (const raw of [
    null,
    undefined,
    '',
    '   ',
    'https://evil.example/phish',
    '//evil.example/phish',
    'javascript:alert(1)',
    'guide/../../dashboard',
    'guide/..',
    'guide/dining?x=1',
    'guide/dining#frag',
    'guide/%2e%2e/x',
    'guide\\dining',
    'Guide/Dining',
    'guide/dining/one/two/three/four',
    'a'.repeat(200),
  ]) {
    assert.equal(sanitizeGuestReturnPath(raw), null, `${String(raw)} must be refused`);
  }
});

test('the landing path keeps the session marker and stays under the tag', () => {
  assert.equal(
    guestLandingPath('LNRX6MKW', 'guide/dining'),
    '/t/LNRX6MKW/guide/dining?nfcSession=1'
  );
  assert.equal(guestLandingPath('LNRX6MKW', null), '/t/LNRX6MKW?nfcSession=1');
  assert.equal(
    guestLandingPath('LNRX6MKW', 'https://evil.example'),
    '/t/LNRX6MKW?nfcSession=1'
  );
});

test('extra query flags survive on both forms', () => {
  assert.equal(
    guestLandingPath('LNRX6MKW', 'guide/dining', { tagStatus: 'inactive' }),
    '/t/LNRX6MKW/guide/dining?nfcSession=1&tagStatus=inactive'
  );
  assert.equal(
    guestLandingPath('LNRX6MKW', null, { tagStatus: 'inactive' }),
    '/t/LNRX6MKW?nfcSession=1&tagStatus=inactive'
  );
});

test('the tag code is encoded, never trusted', () => {
  assert.equal(guestLandingPath('A B', null), '/t/A%20B?nfcSession=1');
});

/*
 * The dashboard side: a launch URL (which already carries ?k=<secret>) gets
 * the landing path added as `to`, and an unusable path adds nothing, so the
 * link degrades to the plain tap rather than to a broken URL.
 */
test('a launch URL gains the landing path as `to`', () => {
  assert.equal(
    withGuestReturnPath('https://cloudhotelph.com/n/LNRX6MKW?k=abc', 'guide/dining'),
    'https://cloudhotelph.com/n/LNRX6MKW?k=abc&to=guide%2Fdining'
  );
});

test('an unusable landing path leaves the launch URL untouched', () => {
  const launch = 'https://cloudhotelph.com/n/LNRX6MKW?k=abc';

  assert.equal(withGuestReturnPath(launch, 'https://evil.example'), launch);
  assert.equal(withGuestReturnPath(launch, ''), launch);
});

test('a malformed launch URL comes back as it was', () => {
  assert.equal(withGuestReturnPath('not a url', 'guide/dining'), 'not a url');
});
