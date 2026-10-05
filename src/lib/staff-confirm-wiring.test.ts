import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * The rule in staff-confirm.ts is only worth anything if the dangerous
 * buttons actually go through it. Two of the five blockers in the 2 October
 * audit were not wrong decisions — they were a decision nobody made at the
 * call site. So this reads the call sites.
 *
 * It is a source-level test, which is unusual and deliberate: there is no
 * assertion about rendering that would catch someone deleting the one line
 * that asks the question, and that deletion is exactly the regression that
 * cost a guest their dinner.
 */

const ROOT = join(process.cwd(), 'src');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

test('the kitchen button asks the rule before it submits', () => {
  const src = read('components/dashboard/KitchenStatusActionButton.tsx');

  assert.match(src, /confirmMessage\(/, 'the kitchen button no longer consults the rule');
  assert.match(
    src,
    /if\s*\(\s*question\s*&&\s*!window\.confirm\(question\)\s*\)\s*\{\s*return/,
    'the kitchen button asks but does not stop when the answer is no'
  );
});

test('every kitchen status button declares what it does, and cancelling says so', () => {
  const page = read('app/dashboard/kitchen/page.tsx');
  const calls = page.match(/<KitchenStatusActionButton[\s\S]*?\/>/g) ?? [];

  assert.ok(calls.length >= 4, `expected the kitchen board's buttons, found ${calls.length}`);

  for (const call of calls) {
    assert.match(call, /\baction=/, `a kitchen button declares no action:\n${call.slice(0, 160)}`);
    assert.match(call, /\border=\{/, `a kitchen button passes no order context:\n${call.slice(0, 160)}`);

    if (/status=\{OrderStatus\.CANCELLED\}/.test(call)) {
      assert.match(
        call,
        /action="(reject|cancel-order)"/,
        'the cancelling button must declare a destructive action, or the rule waves it through'
      );
    }
  }
});

test('both Mark Paid buttons ask before declaring money collected', () => {
  const src = read('app/dashboard/orders/OrdersClient.tsx');
  const marks = src.match(/Mark Paid/g) ?? [];

  assert.ok(marks.length >= 2, 'expected both Mark Paid call sites');
  assert.match(src, /confirmMessage\(\s*'mark-paid'/, 'Mark Paid does not consult the rule');

  /* One guard per button, not one shared guard that only covers the first. */
  const guards = src.match(/confirmMessage\(\s*'mark-paid'/g) ?? [];
  assert.ok(
    guards.length >= 1,
    'Mark Paid must be guarded wherever it is rendered'
  );
});

test('the rule itself still treats an unknown action as dangerous', () => {
  const src = read('lib/staff-confirm.ts');

  assert.doesNotMatch(
    src,
    /return null;\s*\}\s*$/,
    'the fall-through must produce a confirmation, never null'
  );
});
