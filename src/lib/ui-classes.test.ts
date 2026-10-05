import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FOCUS_RING,
  ROUND_EXEMPT,
  badgeClasses,
  buttonClasses,
  cardClasses,
  fieldClasses,
  statusDotClasses,
  statusClasses,
  surfaceClasses,
} from './ui-classes';

/*
 * Every class the six ui/ primitives wear, built in one place.
 *
 * The 2 October audit found the product had no design system, only utility
 * classes: 1,996 `rounded-*` in 30 distinct values, 7-10 radii on one screen,
 * 1,481 `font-black` (more elements at weight 900 than at 400 on the orders
 * board), and `outline-none` on 149 controls of which 37 had no replacement
 * focus style at all -- including both gates into the product and ten inputs
 * in the POS till.
 *
 * So the rules are tests, not intentions. Anything a primitive renders comes
 * from here, and these assertions hold for every variant it can produce.
 */

const EVERY_BUTTON = (
  ['default', 'outline', 'ghost', 'danger'] as const
).flatMap((variant) =>
  (['sm', 'md', 'lg'] as const).map((size) => ({
    name: `${variant}/${size}`,
    classes: buttonClasses({ variant, size }),
  }))
);

const EVERY_BADGE = (['neutral', 'gold', 'green', 'red', 'blue'] as const).map(
  (tone) => ({ name: tone, classes: badgeClasses(tone) })
);

const EVERYTHING = [
  ...EVERY_BUTTON,
  ...EVERY_BADGE,
  { name: 'field', classes: fieldClasses() },
  { name: 'field/invalid', classes: fieldClasses({ invalid: true }) },
  { name: 'card', classes: cardClasses() },
  { name: 'surface', classes: surfaceClasses() },
];

test('nothing the system renders has a corner radius', () => {
  for (const { name, classes } of EVERYTHING) {
    assert.doesNotMatch(classes, /\brounded(-|\b)/, `${name} carries a radius`);
  }
});

/*
 * The documented exception, and the only one: a live status dot and a
 * spinner. The brief allows those two and nothing else.
 */
test('the status dot is the exception, and it is round on purpose', () => {
  assert.match(statusDotClasses('live'), /rounded-dot/);
  assert.deepEqual(ROUND_EXEMPT, ['status dot', 'spinner']);
});

test('no weight above 600 is reachable', () => {
  for (const { name, classes } of EVERYTHING) {
    assert.doesNotMatch(classes, /font-(black|extrabold)\b/, `${name} is too heavy`);
    assert.doesNotMatch(classes, /font-\[(7|8|9)00\]/, `${name} is too heavy`);
  }
});

test('no soft glow survives anywhere', () => {
  for (const { name, classes } of EVERYTHING) {
    assert.doesNotMatch(classes, /shadow-soft/, `${name} still glows`);
  }
});

/*
 * A11Y-10: the product set `outline-none` on 149 controls and replaced it on
 * 112 with a gold ring at 10-35% opacity -- 1.13:1 to 1.90:1, where a focus
 * indicator needs 3:1. Nothing here may remove the outline, and everything a
 * keyboard can reach carries the ring.
 */
test('focus is visible on everything a keyboard can reach, and never removed', () => {
  const reachable = [...EVERY_BUTTON, { name: 'field', classes: fieldClasses() }];

  for (const { name, classes } of reachable) {
    assert.ok(classes.includes(FOCUS_RING), `${name} has no focus ring`);
    assert.doesNotMatch(classes, /outline-none/, `${name} removes its outline`);
  }
});

test('the focus ring is a real outline, offset, and takes its colour from the text', () => {
  assert.match(FOCUS_RING, /focus-visible:outline-2\b/);
  assert.match(FOCUS_RING, /focus-visible:outline-offset-2\b/);
  assert.match(FOCUS_RING, /focus-visible:outline-current\b/);
  assert.doesNotMatch(FOCUS_RING, /ring-/, 'a tinted ring is what failed the audit');
});

/*
 * A11Y-3 and A11Y-4: 32x32 steppers, a 20x20 checkbox, and an "Authorize
 * Device" submit 20px tall. The portal is used one-handed, outdoors.
 */
test('every interactive box is at least 44px tall', () => {
  for (const { name, classes } of EVERY_BUTTON) {
    assert.match(classes, /min-h-11\b/, `${name} is under 44px`);
  }
  assert.match(fieldClasses(), /min-h-11\b/);
});

test('an icon-only control is 44px square, not 32', () => {
  const icon = buttonClasses({ variant: 'ghost', size: 'icon' });
  assert.match(icon, /min-h-11\b/);
  assert.match(icon, /min-w-11\b/);
});

/*
 * The accent is a line, a rule and one word of emphasis -- never a filled
 * surface. Exactly one button variant may carry a solid fill, and it is the
 * neutral ink one, not the gold one.
 */
test('no variant fills a surface with the accent', () => {
  for (const { name, classes } of EVERYTHING) {
    assert.doesNotMatch(classes, /bg-\[?var\(--cv-accent/, `${name} fills with the accent`);
    assert.doesNotMatch(classes, /bg-gold\b/, `${name} fills with the accent`);
  }
});

test('a badge is a hairline and a word, not a coloured pill', () => {
  for (const { name, classes } of EVERY_BADGE) {
    assert.doesNotMatch(classes, /bg-(yellow|green|red|blue|neutral)-\d{2,3}/, `${name} is a pill`);
    assert.match(classes, /border/, `${name} has no hairline`);
  }
});

test('status is a dot and a word; the word is the caller’s', () => {
  const s = statusClasses('wait');
  assert.match(s.wrap, /inline-flex/);
  assert.match(s.dot, /rounded-dot/);
  assert.match(s.dot, /size-\[7px\]/);
  /* The tone colours the dot, never the whole chip. */
  assert.doesNotMatch(s.wrap, /bg-/);
});

test('every status tone resolves to a colour, and an unknown one is neutral', () => {
  for (const tone of ['live', 'wait', 'stop', 'done'] as const) {
    assert.match(statusDotClasses(tone), /bg-\[var\(--cv-status-/, tone);
  }
  assert.match(statusDotClasses('nonsense' as never), /bg-\[var\(--cv-status-done\)\]/);
});

test('a caller’s own classes come last so they can still override', () => {
  assert.ok(buttonClasses({ className: 'w-full' }).endsWith('w-full'));
  assert.ok(fieldClasses({ className: 'max-w-xs' }).endsWith('max-w-xs'));
  assert.ok(cardClasses({ className: 'mt-4' }).endsWith('mt-4'));
});

test('surfaces are separated by a hairline, not by a shadow', () => {
  const card = cardClasses();
  assert.match(card, /border/);
  assert.doesNotMatch(card, /shadow/);
});

test('figures line up: tabular numerals on anything that holds a number', () => {
  assert.match(surfaceClasses(), /tabular-nums/);
});
