import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveGuestRedirectOrigin } from './nfc-redirect-origin';

/*
 * This function decides where a guest lands after tapping a tag, and it has
 * broken twice in one day:
 *
 *   1. It used the configured origin while the access cookie was set on the
 *      origin the request arrived on. When those differed the cookie was
 *      dropped and the guest hit "Tap NFC Again" forever, because tapping again
 *      reproduced the mismatch.
 *
 *   2. Fixing that by using the request's own origin sent every production
 *      guest to localhost:3000 -- behind nginx, request.url is the internal
 *      address nginx dialled, not the address the browser is at.
 *
 * Both failures are guest-facing and total. Every case below is one of them, or
 * a neighbour of one.
 *
 * `null` means "no usable origin here, use the configured public one".
 */

const PROXIED = {
  requestUrl: 'http://127.0.0.1:3000/n/ABC123?k=secret',
};

const DIRECT = {
  forwardedHost: null,
  forwardedProto: null,
};

test('behind a proxy, uses the forwarded host and not our internal address', () => {
  assert.equal(
    resolveGuestRedirectOrigin({
      ...PROXIED,
      forwardedHost: 'cloudhotelph.com',
      forwardedProto: 'https',
    }),
    'https://cloudhotelph.com'
  );
});

test('behind a proxy, http when the forwarded proto is not https', () => {
  assert.equal(
    resolveGuestRedirectOrigin({
      ...PROXIED,
      forwardedHost: 'cloudhotelph.com',
      forwardedProto: 'http',
    }),
    'http://cloudhotelph.com'
  );
});

test('behind a proxy with no forwarded proto, assumes http rather than guessing', () => {
  assert.equal(
    resolveGuestRedirectOrigin({
      ...PROXIED,
      forwardedHost: 'cloudhotelph.com',
      forwardedProto: null,
    }),
    'http://cloudhotelph.com'
  );
});

test('behind a proxy, a non-default port on the forwarded host survives', () => {
  assert.equal(
    resolveGuestRedirectOrigin({
      ...PROXIED,
      forwardedHost: 'staging.cloudhotelph.com:8443',
      forwardedProto: 'https',
    }),
    'https://staging.cloudhotelph.com:8443'
  );
});

test('chained proxies: the first forwarded host is the browser-facing one', () => {
  assert.equal(
    resolveGuestRedirectOrigin({
      ...PROXIED,
      forwardedHost: 'cloudhotelph.com, internal-lb.local',
      forwardedProto: 'https, http',
    }),
    'https://cloudhotelph.com'
  );
});

test('THE PRODUCTION BUG: a proxy must never send a guest to loopback', () => {
  for (const host of ['localhost', 'localhost:3000', '127.0.0.1:3000', '[::1]']) {
    assert.equal(
      resolveGuestRedirectOrigin({
        ...PROXIED,
        forwardedHost: host,
        forwardedProto: 'http',
      }),
      null,
      `forwarded host ${host} must fall back, not be used`
    );
  }
});

test('a proxy forwarding an unusable bind address falls back', () => {
  for (const host of ['0.0.0.0', '0.0.0.0:3000', '[::]']) {
    assert.equal(
      resolveGuestRedirectOrigin({
        ...PROXIED,
        forwardedHost: host,
        forwardedProto: 'http',
      }),
      null,
      `forwarded host ${host} must fall back`
    );
  }
});

test('forwarded host casing does not defeat the loopback check', () => {
  assert.equal(
    resolveGuestRedirectOrigin({
      ...PROXIED,
      forwardedHost: 'LocalHost:3000',
      forwardedProto: 'http',
    }),
    null
  );
});

test('an empty forwarded header counts as no proxy at all', () => {
  assert.equal(
    resolveGuestRedirectOrigin({
      requestUrl: 'http://192.168.0.130:3000/n/ABC123?k=secret',
      forwardedHost: '   ',
      forwardedProto: null,
    }),
    'http://192.168.0.130:3000'
  );
});

test('THE ORIGINAL BUG: directly addressed, stay on the origin the browser used', () => {
  // The access cookie is set on this origin. Redirecting anywhere else drops it.
  assert.equal(
    resolveGuestRedirectOrigin({
      requestUrl: 'http://localhost:3005/n/ABC123?k=secret',
      ...DIRECT,
    }),
    'http://localhost:3005'
  );
});

test('directly addressed on a LAN address, stay there', () => {
  assert.equal(
    resolveGuestRedirectOrigin({
      requestUrl: 'http://192.168.0.130:3000/n/ABC123?k=secret',
      ...DIRECT,
    }),
    'http://192.168.0.130:3000'
  );
});

test('directly addressed over https, the scheme is preserved', () => {
  assert.equal(
    resolveGuestRedirectOrigin({
      requestUrl: 'https://cloudhotelph.com/n/ABC123?k=secret',
      ...DIRECT,
    }),
    'https://cloudhotelph.com'
  );
});

test('a server bound to 0.0.0.0 never produces a browser-usable origin', () => {
  assert.equal(
    resolveGuestRedirectOrigin({
      requestUrl: 'http://0.0.0.0:3000/n/ABC123?k=secret',
      ...DIRECT,
    }),
    null
  );
});

test('a malformed request URL falls back instead of throwing', () => {
  assert.equal(
    resolveGuestRedirectOrigin({
      requestUrl: 'not a url',
      ...DIRECT,
    }),
    null
  );
});

test('the query string never leaks into the origin', () => {
  const origin = resolveGuestRedirectOrigin({
    requestUrl: 'http://192.168.0.130:3000/n/ABC123?k=super-secret-value',
    ...DIRECT,
  });

  assert.ok(origin);
  assert.ok(!origin.includes('super-secret-value'));
  assert.ok(!origin.includes('?'));
});
