import assert from 'node:assert/strict';
import test from 'node:test';

import config from '../../tailwind.config';

/*
 * The design system, asserted at the one place it is defined.
 *
 * The audit's first cause was that nothing was defined once: 1,996
 * `rounded-*` classes across 30 distinct values, 1,481 `font-black`, and a
 * 60px `shadow-soft` on every card. Those class names sit in 92 files and are
 * swept in the phase after this one -- but the moment the scale below says
 * zero, every one of them renders square, so the product cannot regress while
 * the sweep is in flight. These tests are what stop the scale drifting back.
 */

const theme = config.theme ?? {};
const radius = (theme.borderRadius ?? {}) as Record<string, string>;
const weight = (theme.fontWeight ?? {}) as Record<string, string>;
const shadow = (theme.boxShadow ?? {}) as Record<string, string>;
const font = (theme.fontFamily ?? {}) as Record<string, string[]>;

test('the radius scale is replaced, not extended, so no default survives', () => {
  /* `extend` would leave Tailwind's own sm/md/lg/xl/2xl/3xl/full in place. */
  assert.ok(theme.borderRadius, 'borderRadius must be set on theme, not theme.extend');
  assert.equal((config.theme?.extend as Record<string, unknown>)?.borderRadius, undefined);
});

test('every radius in the scale is zero, except the documented dot', () => {
  const round = Object.entries(radius).filter(([, v]) => v !== '0' && v !== '0px');

  assert.deepEqual(
    round.map(([k]) => k),
    ['dot'],
    'only `rounded-dot` may be round'
  );
  assert.equal(radius.dot, '9999px');
});

test('the radii the product actually uses all resolve to zero', () => {
  for (const key of ['DEFAULT', 'none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full']) {
    assert.equal(radius[key], '0', `rounded-${key} is not square`);
  }
});

test('font-black caps at 600', () => {
  assert.equal(weight.black, '600');
  assert.equal(weight.extrabold, '600');
  for (const [name, value] of Object.entries(weight)) {
    assert.ok(Number(value) <= 600, `font-${name} is ${value}, above the 600 ceiling`);
  }
});

test('shadow-soft is no longer a 60px glow', () => {
  assert.ok('soft' in shadow, 'the name must stay so the 17 call sites still compile');
  assert.equal(shadow.soft, 'none');
});

test('elevation exists only for things that genuinely float, and is tight and dark', () => {
  assert.match(shadow.float ?? '', /^0 2px 10px rgba\(0, ?0, ?0, ?0\.\d+\)$/);
  const blur = Number((shadow.float ?? '').match(/(\d+)px rgba/)?.[1] ?? 0);
  assert.ok(blur <= 16, `float blur is ${blur}px; a glow starts around 24`);
});

test('both faces are wired to the next/font variables, with real fallbacks', () => {
  assert.equal(font.serif?.[0], 'var(--cv-serif)');
  assert.equal(font.sans?.[0], 'var(--cv-sans)');
  assert.ok((font.serif?.length ?? 0) > 1, 'the serif has no fallback stack');
  assert.ok((font.sans?.length ?? 0) > 1, 'the sans has no fallback stack');
  assert.ok(font.serif?.includes('Georgia'));
});

test('the hairline is a token, so 1px rules do the work shadows were doing', () => {
  const colors = (theme.extend as { colors?: Record<string, unknown> })?.colors ?? {};
  const cv = (colors.cv ?? {}) as Record<string, string>;

  assert.equal(cv.hairline, 'var(--cv-hairline)');
  assert.equal(colors.hairline, 'var(--cv-hairline)');
});

test('the five palettes are untouched: every colour is still a --cv-* variable', () => {
  const colors = (theme.extend as { colors?: Record<string, unknown> })?.colors ?? {};
  const flat: string[] = [];
  const walk = (o: Record<string, unknown>) => {
    for (const v of Object.values(o)) {
      if (typeof v === 'string') flat.push(v);
      else if (v && typeof v === 'object') walk(v as Record<string, unknown>);
    }
  };
  walk(colors as Record<string, unknown>);

  assert.ok(flat.length > 0);
  for (const value of flat) {
    assert.match(value, /^var\(--cv-/, `${value} is a literal, not a token`);
  }
});
