import assert from 'node:assert/strict';
import test from 'node:test';

import { emptyState, pluralise } from './empty-state';

/*
 * ST-7 and CP-9. The product writes its empty states in two vocabularies and
 * picks between them by habit: 20 screens say "No <thing> found", which tells
 * the reader a search ran, and 35 say "No <thing> yet", which tells them none
 * exist. Six screens then follow up with "Try changing your search or filter"
 * — including on a fresh install where no search has been typed and no filter
 * is set, so the person is told to undo something they never did.
 *
 * The difference is not stylistic. "Found" is a report on a query; "yet" is a
 * report on the world. Only one of them is ever true, and only one of them
 * leaves the reader with something to do.
 */

test('nothing exists: say so, and never blame a filter', () => {
  const state = emptyState({ total: 0, filtered: false, noun: 'order' });

  assert.equal(state.title, 'No orders yet');
  assert.equal(state.canClear, false);
  assert.doesNotMatch(state.detail, /search|filter/i);
});

test('nothing exists, and a filter happens to be set: the world still wins', () => {
  /* A filter cannot hide what was never there, so blaming it would be a lie. */
  const state = emptyState({ total: 0, filtered: true, noun: 'order' });

  assert.equal(state.title, 'No orders yet');
  assert.equal(state.canClear, false);
});

test('things exist but the filter hid them: say that, and offer the way back', () => {
  const state = emptyState({ total: 12, filtered: true, noun: 'order' });

  assert.equal(state.title, 'Nothing matches that');
  assert.equal(state.canClear, true);
  assert.match(state.detail, /12 orders/);
});

test('the detail names the search term when there is one', () => {
  const state = emptyState({
    total: 12,
    filtered: true,
    noun: 'order',
    query: 'zzzznothing',
  });

  assert.match(state.detail, /zzzznothing/);
});

test('one is one', () => {
  const state = emptyState({ total: 1, filtered: true, noun: 'order' });

  assert.match(state.detail, /1 order\b/);
  assert.doesNotMatch(state.detail, /1 orders/);
});

test('a caller can say what would put the first one here', () => {
  const state = emptyState({
    total: 0,
    filtered: false,
    noun: 'order',
    emptyDetail: 'Orders placed from a guest portal arrive here.',
  });

  assert.equal(state.detail, 'Orders placed from a guest portal arrive here.');
});

test('an irregular plural is the caller’s to supply', () => {
  const state = emptyState({
    total: 0,
    filtered: false,
    noun: 'entry',
    plural: 'entries',
  });

  assert.equal(state.title, 'No entries yet');
});

test('pluralise handles the regular case and defers on the rest', () => {
  assert.equal(pluralise('order', 0), 'orders');
  assert.equal(pluralise('order', 1), 'order');
  assert.equal(pluralise('order', 2), 'orders');
  assert.equal(pluralise('entry', 2, 'entries'), 'entries');
});
