import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeGuideSearchText,
  searchGuide,
} from './guide-search';

/*
 * How the guest guide's search understands what a guest typed.
 *
 * Driven on the live site on 11 September: "wifi" -> 0 results, "wi fi" -> 0,
 * "checkout" -> 0, "check out" -> 0 -- while "Wi-Fi" and "check-out" found
 * two each. The search was a plain substring match against the hotel's own
 * spelling, and the empty state then said "Try Wi-Fi" to a guest who had just
 * typed it. And "breakfast" returned the Dining *section* card, not the
 * "Restaurant Hours" card that actually holds the answer.
 *
 * The rule lives here, free of React, so both problems are pinned.
 */

const sections = [
  {
    id: 'dining',
    title: 'Dining',
    subtitle: 'Explore our restaurants and bars',
    description: 'Restaurant, café, breakfast, and room service information.',
    iconKey: 'Utensils',
    galleryImages: [{ title: 'Pool bar', caption: 'Sunset drinks' }],
    items: [
      {
        id: 'hours',
        title: 'Restaurant Hours',
        subtitle: 'Dining schedule',
        content: 'Breakfast: 6:00 AM - 10:00 AM. Restaurant: 6:00 AM - 10:00 PM',
        hours: '6:00 AM - 10:00 PM',
        location: null,
        contact: null,
      },
    ],
  },
  {
    id: 'info',
    title: 'Hotel Information',
    subtitle: 'Policies, Wi-Fi, check-out time and more',
    description: 'Important guest information during your stay.',
    iconKey: 'Info',
    galleryImages: [],
    items: [
      {
        id: 'wifi',
        title: 'Wi-Fi',
        subtitle: 'Guest internet access',
        content: 'Network: CloudView-Guest',
        hours: null,
        location: null,
        contact: null,
      },
      {
        id: 'times',
        title: 'Check-in / Check-out',
        subtitle: 'Standard hotel schedule',
        content: 'Check-in: 2:00 PM. Check-out: 12:00 PM',
        hours: null,
        location: null,
        contact: null,
      },
    ],
  },
];

test('normalisation folds case, hyphens, spaces and accents', () => {
  assert.equal(normalizeGuideSearchText('Wi-Fi'), 'wifi');
  assert.equal(normalizeGuideSearchText('wi fi'), 'wifi');
  assert.equal(normalizeGuideSearchText('Check-Out time'), 'checkouttime');
  assert.equal(normalizeGuideSearchText('Café'), 'cafe');
});

test('THE BUG: "wifi", "wi fi" and "WIFI" all find the Wi-Fi card', () => {
  for (const query of ['wifi', 'wi fi', 'WIFI', 'wi-fi']) {
    const result = searchGuide(sections, query);

    assert.ok(
      result.items.some((hit) => hit.item.id === 'wifi'),
      `${query} must find the Wi-Fi item`
    );
  }
});

test('THE BUG: "checkout", "check out" and "check-out" all find the times card', () => {
  for (const query of ['checkout', 'check out', 'check-out', 'Checkout']) {
    const result = searchGuide(sections, query);

    assert.ok(
      result.items.some((hit) => hit.item.id === 'times'),
      `${query} must find the check-in/check-out item`
    );
  }
});

test('the answer comes back, not just the drawer it is in', () => {
  const result = searchGuide(sections, 'breakfast');

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].item.id, 'hours');
  assert.equal(result.items[0].section.id, 'dining');
});

test('a section is only its own result when the section itself matches', () => {
  // "breakfast" appears in the Dining description, so Dining is a result too;
  // "network" appears only inside the Wi-Fi item, so Hotel Information is not.
  assert.ok(searchGuide(sections, 'breakfast').sections.some((s) => s.id === 'dining'));
  assert.equal(searchGuide(sections, 'network').sections.length, 0);
  assert.equal(searchGuide(sections, 'network').items[0]?.item.id, 'wifi');
});

test('common synonyms reach the same card', () => {
  assert.ok(searchGuide(sections, 'internet').items.some((h) => h.item.id === 'wifi'));
  assert.ok(searchGuide(sections, 'password').items.some((h) => h.item.id === 'wifi'));
  assert.ok(searchGuide(sections, 'departure').items.some((h) => h.item.id === 'times'));
  assert.ok(searchGuide(sections, 'arrival').items.some((h) => h.item.id === 'times'));
  assert.ok(searchGuide(sections, 'food').items.some((h) => h.item.id === 'hours'));
});

test('gallery captions still count for the section', () => {
  assert.ok(searchGuide(sections, 'sunset').sections.some((s) => s.id === 'dining'));
});

test('an empty or whitespace query matches nothing', () => {
  for (const query of ['', '   ']) {
    const result = searchGuide(sections, query);

    assert.equal(result.sections.length, 0);
    assert.equal(result.items.length, 0);
  }
});

test('an accented query finds unaccented text and vice versa', () => {
  assert.ok(searchGuide(sections, 'cafe').sections.some((s) => s.id === 'dining'));
  assert.ok(searchGuide(sections, 'café').sections.some((s) => s.id === 'dining'));
});

test('no item is returned twice', () => {
  const result = searchGuide(sections, 'check');
  const ids = result.items.map((h) => h.item.id);

  assert.equal(ids.length, new Set(ids).size);
});
