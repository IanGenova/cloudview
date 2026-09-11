import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldForceHttpsForRequest } from './https-redirect-policy';

/*
 * Whether a request should be 308'd to https.
 *
 * This is the third appearance of one bug. The first two were in the NFC
 * launch handler and are pinned in nfc-redirect-origin.test.ts; this is the
 * same mistake in the middleware that fronts every route, where it is worse,
 * because it takes the whole application down rather than one flow.
 *
 * The middleware read `request.nextUrl.hostname` and compared it against a
 * list of hosts exempt from the redirect -- localhost, 127.0.0.1, 10.x,
 * 192.168.x, 172.16-31.x. Under `next start -H 0.0.0.0` -- and `npm run dev`
 * binds the same way -- that hostname is the *bind* address,
 * not the Host header. `0.0.0.0` matches no exemption, so every route on every
 * plain-HTTP deployment answered 308 -> https://0.0.0.0:PORT, which resolves
 * to nothing at all.
 *
 * The host a browser actually used is what this must reason about, and only
 * the forwarded headers or the request URL know it.
 */

const PROD = { isProduction: true };

test('a bind address is never treated as a hostname', () => {
  for (const host of ['0.0.0.0', '[::]']) {
    assert.equal(
      shouldForceHttpsForRequest({
        requestUrl: `http://${host}:3000/dashboard`,
        ...PROD,
      }),
      false,
      `${host} must not be redirected -- this is the outage`
    );
  }
});

test('loopback and private ranges are left on http', () => {
  for (const host of [
    'localhost:3000',
    '127.0.0.1:3000',
    '192.168.0.130:3000',
    '10.1.2.3',
    '172.16.0.9',
    '172.31.255.1',
  ]) {
    assert.equal(
      shouldForceHttpsForRequest({
        requestUrl: `http://${host}/dashboard`,
        ...PROD,
      }),
      false,
      host
    );
  }
});

test('172.15 and 172.32 are public, not private', () => {
  for (const host of ['172.15.0.1', '172.32.0.1']) {
    assert.equal(
      shouldForceHttpsForRequest({
        requestUrl: `http://${host}/dashboard`,
        ...PROD,
      }),
      true,
      host
    );
  }
});

test('a public host on plain http is redirected', () => {
  assert.equal(
    shouldForceHttpsForRequest({
      requestUrl: 'http://cloudhotelph.com/dashboard',
      ...PROD,
    }),
    true
  );
});

test('a request already on https is left alone', () => {
  assert.equal(
    shouldForceHttpsForRequest({
      requestUrl: 'https://cloudhotelph.com/dashboard',
      ...PROD,
    }),
    false
  );
});

/*
 * Behind nginx the request URL is the internal address nginx dialled, so the
 * forwarded headers are the only source of truth about the browser. This is
 * the case that made production work while localhost was dark.
 */
test('behind a proxy the forwarded host decides, not the dialled address', () => {
  assert.equal(
    shouldForceHttpsForRequest({
      requestUrl: 'http://127.0.0.1:3000/dashboard',
      forwardedHost: 'cloudhotelph.com',
      forwardedProto: 'https',
      ...PROD,
    }),
    false,
    'TLS terminated at the proxy -- redirecting again is a loop'
  );

  assert.equal(
    shouldForceHttpsForRequest({
      requestUrl: 'http://127.0.0.1:3000/dashboard',
      forwardedHost: 'cloudhotelph.com',
      forwardedProto: 'http',
      ...PROD,
    }),
    true,
    'the browser really is on http'
  );
});

test('a proxy forwarding a private host is still exempt', () => {
  assert.equal(
    shouldForceHttpsForRequest({
      requestUrl: 'http://127.0.0.1:3000/dashboard',
      forwardedHost: '192.168.0.130:3000',
      forwardedProto: 'http',
      ...PROD,
    }),
    false
  );
});

test('the first forwarded entry wins, being nearest the browser', () => {
  assert.equal(
    shouldForceHttpsForRequest({
      requestUrl: 'http://127.0.0.1:3000/dashboard',
      forwardedHost: 'cloudhotelph.com, internal.lb',
      forwardedProto: 'https, http',
      ...PROD,
    }),
    false
  );
});

/*
 * A proxy that forwards its own loopback address is misconfigured. We cannot
 * tell where the browser is, and a redirect built on a guess is exactly the
 * outage above -- so decline to redirect and let the request through.
 */
test('an unusable forwarded host does not produce a redirect', () => {
  for (const forwardedHost of ['0.0.0.0', '127.0.0.1:3000', '']) {
    assert.equal(
      shouldForceHttpsForRequest({
        requestUrl: 'http://0.0.0.0:3000/dashboard',
        forwardedHost,
        forwardedProto: 'http',
        ...PROD,
      }),
      false,
      JSON.stringify(forwardedHost)
    );
  }
});

test('development never redirects', () => {
  assert.equal(
    shouldForceHttpsForRequest({
      requestUrl: 'http://cloudhotelph.com/dashboard',
      isProduction: false,
    }),
    false
  );
});

test('a malformed request url does not redirect', () => {
  assert.equal(
    shouldForceHttpsForRequest({ requestUrl: 'not a url', ...PROD }),
    false
  );
});

/*
 * The header set `next start -H 127.0.0.1` actually delivers: a forwarded
 * host synthesised from Host, and a request URL naming the bind address. The
 * resolver now honours that loopback host (it is the browser's own address),
 * and loopback is exempt here -- so a production build on a developer's
 * machine with FORCE_HTTPS on still does not redirect itself into a wall.
 */
test('a production build on loopback, as next start delivers it, does not redirect', () => {
  assert.equal(
    shouldForceHttpsForRequest({
      requestUrl: 'http://localhost:3007/dashboard',
      requestHost: '127.0.0.1:3007',
      forwardedHost: '127.0.0.1:3007',
      forwardedProto: 'http',
      ...PROD,
    }),
    false
  );
});
