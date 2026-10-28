import assert from 'node:assert/strict';
import test from 'node:test';

import { getPOSCashSettlement } from './pos-cash-settlement';

test('cash settlement uses the server total and returns exact change in cents', () => {
  assert.deepEqual(getPOSCashSettlement(31720, 50000), {
    totalCents: 31720,
    tenderedCents: 50000,
    changeCents: 18280,
  });
});

test('cash settlement rejects missing, insufficient, and fractional cent amounts', () => {
  for (const tendered of [undefined, 31719, 31720.5, Number.NaN]) {
    assert.throws(() => getPOSCashSettlement(31720, tendered));
  }
});
