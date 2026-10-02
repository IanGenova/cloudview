/*
 * The owner runs this, nobody else.
 *
 * It records that the redesign captures in ./img have been looked at, by hashing
 * them into `.flow/uiux-confirmed`, and lifts `.flow/uiux/pending` so the apply
 * phases can write source again. If the captures change after this runs, the
 * hash stops matching and the gate closes itself.
 *
 *   node .flow/uiux/2026-10-02/confirm.mjs
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const flow = join(here, '..', '..');
const img = join(here, 'img');

const files = readdirSync(img).filter((f) => f.endsWith('.png')).sort();
if (!files.length) {
  console.error('No redesign captures found in', img);
  process.exit(1);
}

const hash = createHash('sha256');
for (const f of files) {
  hash.update(f);
  hash.update(readFileSync(join(img, f)));
}
const digest = hash.digest('hex');

writeFileSync(
  join(flow, 'uiux-confirmed'),
  `${digest}\n2026-10-02\n${files.length} captures\nconfirmed ${new Date().toISOString()}\n`
);

const pending = join(flow, 'uiux', 'pending');
if (existsSync(pending)) rmSync(pending);

console.log(`Confirmed ${files.length} redesign captures.`);
console.log(`  .flow/uiux-confirmed written (${digest.slice(0, 16)}…)`);
console.log('  .flow/uiux/pending removed — the apply phases can start.');
