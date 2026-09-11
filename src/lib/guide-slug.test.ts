import assert from 'node:assert/strict';
import test from 'node:test';

import { createGuideSlug } from './guide-slug';

/*
 * The guest guide addresses a section by a slug of its title, and the section
 * page finds the section by rebuilding that slug from every title. The same
 * function used to live, copied, in both guest files; the dashboard's "Open in
 * guest portal" link now needs the same answer, so it lives here once. These
 * pin the behaviour as it was -- a change here changes guest URLs.
 */

test('a title becomes a lowercase hyphenated slug', () => {
  assert.equal(createGuideSlug('Hotel Information'), 'hotel-information');
  assert.equal(createGuideSlug('Nearby Attractions'), 'nearby-attractions');
});

test('an ampersand reads as "and"', () => {
  assert.equal(createGuideSlug('Bars & Lounges'), 'bars-and-lounges');
});

test('punctuation and runs of spaces collapse to one hyphen, edges trimmed', () => {
  assert.equal(createGuideSlug('  Pool,  Spa / Gym!  '), 'pool-spa-gym');
});

test('the same title always gives the same slug', () => {
  assert.equal(createGuideSlug('Dining'), createGuideSlug('dining'));
});
