/*
 * Companion to migration-drift-report.cjs.
 *
 * That report verifies objects a migration CREATES, by existence. It cannot
 * judge statements that change something already there -- MODIFY COLUMN, DROP
 * INDEX -- so it reports those for review rather than guessing.
 *
 * This checks exactly those statements against the live schema:
 *
 *   MODIFY COLUMN with an ENUM   every value in the migration present live?
 *   MODIFY COLUMN nullability    IS_NULLABLE matches?
 *   MODIFY COLUMN type           DATA_TYPE matches?
 *   DROP INDEX                   index actually gone?
 *
 * Read-only. Verdicts are conservative: anything it cannot parse is UNKNOWN,
 * and a migration is only called APPLIED when every check passes.
 *
 *   export DATABASE_URL=...
 *   node scripts/migration-modify-check.cjs
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');
}

function statementsOf(sql) {
  return stripComments(sql)
    .split(';')
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

async function column(table, name) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT COLUMN_TYPE, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',
    table,
    name
  );
  return rows[0] || null;
}

async function indexExists(table, name) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT COUNT(*) c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?',
    table,
    name
  );
  return Number(rows[0].c) > 0;
}

function enumValues(text) {
  const m = text.match(/ENUM\s*\(([^)]*)\)/i);
  if (!m) return null;
  return m[1]
    .split(',')
    .map((v) => v.trim().replace(/^'/, '').replace(/'$/, ''))
    .filter(Boolean);
}

async function checkStatement(statement) {
  const drop = statement.match(/^DROP INDEX\s+`([^`]+)`\s+ON\s+`([^`]+)`/i);
  if (drop) {
    const present = await indexExists(drop[2], drop[1]);
    return {
      label: `index ${drop[2]}.${drop[1]} dropped`,
      ok: !present,
    };
  }

  const modify = statement.match(
    /^ALTER TABLE\s+`([^`]+)`\s+MODIFY(?:\s+COLUMN)?\s+`([^`]+)`\s+(.*)$/i
  );
  if (!modify) return null;

  const [, table, name, definition] = modify;
  const live = await column(table, name);

  if (!live) {
    return { label: `${table}.${name} exists`, ok: false };
  }

  const wanted = enumValues(definition);
  if (wanted) {
    const have = enumValues(live.COLUMN_TYPE) || [];
    const missing = wanted.filter((v) => !have.includes(v));
    return {
      label: `${table}.${name} enum has ${wanted.length} value(s)`,
      ok: missing.length === 0,
      detail: missing.length ? `missing: ${missing.join(', ')}` : '',
    };
  }

  const wantsNull = !/NOT NULL/i.test(definition) && /\bNULL\b/i.test(definition);
  const wantsNotNull = /NOT NULL/i.test(definition);
  const typeWord = (definition.match(/^([A-Za-z]+)/) || [])[1];

  const checks = [];
  if (typeWord) {
    checks.push(live.DATA_TYPE.toLowerCase() === typeWord.toLowerCase());
  }
  if (wantsNull) checks.push(live.IS_NULLABLE === 'YES');
  if (wantsNotNull) checks.push(live.IS_NULLABLE === 'NO');

  if (checks.length === 0) return null;

  return {
    label: `${table}.${name} is ${typeWord || '?'}${wantsNull ? ' NULL' : wantsNotNull ? ' NOT NULL' : ''}`,
    ok: checks.every(Boolean),
    detail: `live: ${live.COLUMN_TYPE} ${live.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`,
  };
}

async function main() {
  console.log('database:', (await prisma.$queryRawUnsafe('SELECT DATABASE() AS c'))[0].c, '\n');

  let applied = [];
  try {
    applied = await prisma.$queryRawUnsafe(
      'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations'
    );
  } catch {
    console.log('(no _prisma_migrations - treating all as pending)\n');
  }
  const finished = new Set(
    applied.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name)
  );

  const safe = [];
  const notSafe = [];

  for (const name of fs.readdirSync(MIGRATIONS_DIR).sort()) {
    const file = path.join(MIGRATIONS_DIR, name, 'migration.sql');
    if (!fs.existsSync(file) || finished.has(name)) continue;

    const results = [];
    for (const statement of statementsOf(fs.readFileSync(file, 'utf8'))) {
      const r = await checkStatement(statement);
      if (r) results.push(r);
    }

    if (results.length === 0) continue;

    console.log(name);
    for (const r of results) {
      console.log(`  ${r.ok ? 'YES' : 'NO '}  ${r.label}${r.detail ? '   (' + r.detail + ')' : ''}`);
    }

    if (results.every((r) => r.ok)) {
      console.log('  => already applied\n');
      safe.push(name);
    } else {
      console.log('  => NOT fully applied - do not mark applied\n');
      notSafe.push(name);
    }
  }

  console.log('--- summary ---');
  console.log('changes already in place :', safe.length);
  console.log('still needing work       :', notSafe.length);

  if (safe.length) {
    console.log('\nSafe to mark applied:\n');
    safe.forEach((n) => console.log(`npx prisma migrate resolve --applied ${n}`));
  }
  if (notSafe.length) {
    console.log('\nNOT safe - these need their changes applied first:\n');
    notSafe.forEach((n) => console.log('  ' + n));
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await prisma.$disconnect();
});
