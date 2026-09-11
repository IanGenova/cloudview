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

/*
 * What `next start` actually delivers, measured on the built app bound to
 * 127.0.0.1:3007 with curl:
 *
 *   req.headers['x-forwarded-host'] ??= req.headers['host']   (base-server ~L609)
 *   request.url = http://<bind hostname>:<port>/...      (resolve-routes ~L117)
 *
 * So every request arrives with a forwarded host synthesised from the Host
 * header, and request.url carries the BIND name, not the Host the browser
 * sent: dial 127.0.0.1:3007 and request.url still says localhost:3007. The
 * first repair compared the forwarded host against request.url and so it
 * honoured `localhost` and refused `127.0.0.1` -- the curl in the finding
 * still went to cloudhotelph.com. The right comparison is against the Host
 * header itself: a forwarded loopback host equal to Host is Next echoing the
 * browser's own address; one that differs is a proxy claiming loopback.
 */
const NEXT_START_ON_LOOPBACK = {
  // next start -H 127.0.0.1 -p 3007, browser (or curl) at 127.0.0.1:3007
  requestUrl: 'http://localhost:3007/n/pool-deck-main-panel?k=secret',
  requestHost: '127.0.0.1:3007',
  forwardedHost: '127.0.0.1:3007',
  forwardedProto: 'http',
};

test('NEXT START: the synthesised forwarded host equals Host, so it is the browser\x27s own address -- honour it', () => {
  assert.equal(
    resolveGuestRedirectOrigin(NEXT_START_ON_LOOPBACK),
    'http://127.0.0.1:3007'
  );

  assert.equal(
    resolveGuestRedirectOrigin({
      ...NEXT_START_ON_LOOPBACK,
      requestHost: 'localhost:3007',
      forwardedHost: 'localhost:3007',
    }),
    'http://localhost:3007'
  );

  assert.equal(
    resolveGuestRedirectOrigin({
      ...NEXT_START_ON_LOOPBACK,
      requestHost: '[::1]:3007',
      forwardedHost: '[::1]:3007',
    }),
    'http://[::1]:3007'
  );

  assert.equal(
    resolveGuestRedirectOrigin({
      ...NEXT_START_ON_LOOPBACK,
      forwardedHost: '127.0.0.1:3007 ',
      requestHost: ' 127.0.0.1:3007',
    }),
    'http://127.0.0.1:3007',
    'whitespace around either value does not defeat the match'
  );
});

test('NEXT START: request.url naming the bind address instead of the Host must not matter', () => {
  // request.url is built from the -H value; it is not evidence of anything.
  for (const requestUrl of [
    'http://localhost:3007/n/ABC?k=s',
    'http://0.0.0.0:3007/n/ABC?k=s',
    'http://cloudhotelph.com/n/ABC?k=s',
    'not a url',
  ]) {
    assert.equal(
      resolveGuestRedirectOrigin({ ...NEXT_START_ON_LOOPBACK, requestUrl }),
      'http://127.0.0.1:3007',
      `request.url ${requestUrl} must not change the answer`
    );
  }
});

test('NEXT START over https (next dev --experimental-https): the scheme follows the forwarded proto', () => {
  assert.equal(
    resolveGuestRedirectOrigin({
      ...NEXT_START_ON_LOOPBACK,
      requestHost: 'localhost:3000',
      forwardedHost: 'localhost:3000',
      forwardedProto: 'https',
    }),
    'https://localhost:3000'
  );
});

test('a proxy forwarding a DIFFERENT loopback host than the request\x27s own falls back', () => {
  // Host says 127.0.0.1:3000 (the upstream address), the proxy explicitly
  // claims some other loopback name. That is a misconfiguration and no
  // browser-usable origin can be derived from it; the configured one wins.
  for (const forwardedHost of ['localhost', 'localhost:3000', '[::1]', '127.0.0.1:9999']) {
    assert.equal(
      resolveGuestRedirectOrigin({
        ...PROXIED,
        requestHost: '127.0.0.1:3000',
        forwardedHost,
        forwardedProto: 'http',
      }),
      null,
      `forwarded host ${forwardedHost} differs from the request host and must fall back`
    );
  }
});

test('without a Host to compare against, the request URL host is the next best evidence', () => {
  // Runtimes that do not hand us the Host header (tests, other adapters).
  assert.equal(
    resolveGuestRedirectOrigin({
      requestUrl: 'http://127.0.0.1:3000/n/ABC123?k=secret',
      forwardedHost: '127.0.0.1:3000',
      forwardedProto: 'http',
    }),
    'http://127.0.0.1:3000'
  );

  assert.equal(
    resolveGuestRedirectOrigin({
      requestUrl: 'http://127.0.0.1:3000/n/ABC123?k=secret',
      forwardedHost: 'localhost:3000',
      forwardedProto: 'http',
    }),
    null
  );
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
