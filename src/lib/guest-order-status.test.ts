import assert from 'node:assert/strict';
import test from 'node:test';
import { FulfillmentTiming, OrderStatus } from '@prisma/client';

import { getGuestOrderDestination, getGuestOrderProgress } from './guest-order-status';

const base = {
  status: OrderStatus.PENDING,
  notes: 'Order Type: Pick Up at Counter',
  fulfillmentTiming: FulfillmentTiming.ASAP,
  scheduledFor: null,
  releasedAt: null,
};

test('pending order is received, not confirmed or promised a delivery time', () => {
  const progress = getGuestOrderProgress(base);
  assert.equal(progress.title, 'Order received');
  assert.equal(progress.etaLabel, 'Next step');
  assert.doesNotMatch(progress.subtitle, /kitchen|delivered/i);
});

test('scheduled order states when it will reach the hotel team', () => {
  const progress = getGuestOrderProgress({
    ...base,
    fulfillmentTiming: FulfillmentTiming.SCHEDULED,
    scheduledFor: new Date('2026-10-29T04:30:00.000Z'),
  });
  assert.equal(progress.title, 'Order scheduled');
  assert.match(progress.eta, /Oct 29/);
  assert.match(progress.eta, /12:30\s?PM/i);
});

test('ready pickup never promises room delivery', () => {
  const progress = getGuestOrderProgress({ ...base, status: OrderStatus.READY });
  assert.match(progress.subtitle, /collect it at the counter/i);
  assert.doesNotMatch(progress.subtitle, /room/i);
});

test('room service ready message names room delivery without inventing an ETA', () => {
  const progress = getGuestOrderProgress({
    ...base,
    notes: 'Order Type: Room Service / Deliver to Room',
    status: OrderStatus.READY,
  });
  assert.match(progress.subtitle, /deliver it to your room/i);
  assert.equal(progress.eta, 'Ready now');
});

test('destination follows the selected service type rather than the NFC room', () => {
  assert.equal(getGuestOrderDestination('Order Type: Dine In', '305', ''), 'Dine in');
  assert.equal(getGuestOrderDestination('Order Type: Pick Up at Counter', '305', ''), 'Pick up at counter');
  assert.equal(getGuestOrderDestination('Order Type: Room Service / Deliver to Room', '305', ''), 'Room 305');
});
