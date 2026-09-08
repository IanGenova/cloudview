/*
 * Reports, for every migration Prisma still considers pending, whether the
 * objects it creates already exist in the target database.
 *
 * This exists because a hand-applied fix leaves the schema correct while the
 * _prisma_migrations bookkeeping still says pending. `migrate deploy` then dies
 * on "Duplicate column", and recovering one migration at a time is slow and
 * invites guessing. Guessing is how a migration gets marked applied while some
 * of its statements never ran.
 *
 * Read-only. It changes nothing; it prints what to do.
 *
 *   export DATABASE_URL=...        # the database the APP uses
 *   node scripts/migration-drift-report.cjs
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const MIGRATIONS_DIR = path.join(__dirname, '..', 'prisma', 'migrations');

/* Strip comments so they cannot contribute false matches. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '');
}

/*
 * Pull out the objects a migration creates. Prisma emits a small, predictable
 * set of statement shapes, so this stays a parser for those rather than a
 * general SQL parser. Anything it does not recognise is reported as
 * unclassified rather than silently ignored -- an unrecognised statement is
 * exactly the case where a human needs to look.
 */
function extractObjects(rawSql) {
  const sql = stripComments(rawSql);
  const objects = [];
  const unclassified = [];

  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    const createTable = statement.match(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`([^`]+)`/i);
    if (createTable) {
      objects.push({ kind: 'table', table: createTable[1] });
      continue;
    }

    const createIndex = statement.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+`([^`]+)`\s+ON\s+`([^`]+)`/i);
    if (createIndex) {
      objects.push({ kind: 'index', table: createIndex[2], name: createIndex[1] });
      continue;
    }

    const alter = statement.match(/^ALTER TABLE\s+`([^`]+)`\s*([\s\S]*)$/i);
    if (alter) {
      const table = alter[1];
      const body = alter[2];
      let matched = false;

      for (const m of body.matchAll(/ADD COLUMN\s+`([^`]+)`/gi)) {
        objects.push({ kind: 'column', table, name: m[1] });
        matched = true;
      }

      for (const m of body.matchAll(/ADD CONSTRAINT\s+`([^`]+)`/gi)) {
        objects.push({ kind: 'constraint', table, name: m[1] });
        matched = true;
      }

      /*
       * A single ALTER can mix ADD COLUMN with MODIFY, DROP or CHANGE. Only
       * the ADDs are verifiable by existence, so if anything else rides
       * along, the migration must not be judged on the ADDs alone --
       * marking it applied would skip the rest for good.
       */
      const residual = body
        .replace(/ADD COLUMNs+`[^`]+`[^,]*/gi, '')
        .replace(/ADD CONSTRAINT[sS]*/gi, '');

      if (/(MODIFY|DROP|CHANGE|RENAME)/i.test(residual) || !matched) {
        unclassified.push(statement.slice(0, 90).replace(/s+/g, ' '));
      }
      continue;
    }

    unclassified.push(statement.slice(0, 90).replace(/\s+/g, ' '));
  }

  return { objects, unclassified };
}

async function exists(object) {
  const one = async (sql, ...args) =>
    Number((await prisma.$queryRawUnsafe(sql, ...args))[0].c) > 0;

  if (object.kind === 'table') {
    return one(
      'SELECT COUNT(*) c FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
      object.table
    );
  }
  if (object.kind === 'column') {
    return one(
      'SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',
      object.table,
      object.name
    );
  }
  if (object.kind === 'index') {
    return one(
      'SELECT COUNT(*) c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?',
      object.table,
      object.name
    );
  }
  return one(
    'SELECT COUNT(*) c FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?',
    object.table,
    object.name
  );
}

async function main() {
  const db = (await prisma.$queryRawUnsafe('SELECT DATABASE() AS c'))[0].c;
  console.log('database:', db, '\n');

  /*
   * A database with no _prisma_migrations was never baselined. Treat every
   * migration as pending rather than failing: the per-object checks below are
   * still the useful part, and refusing to run would hide them.
   */
  let applied = [];

  try {
    applied = await prisma.$queryRawUnsafe(
      'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations'
    );
  } catch {
    console.log('(no _prisma_migrations table - treating every migration as pending)');
  }

  const finished = new Set(
    applied
      .filter((r) => r.finished_at && !r.rolled_back_at)
      .map((r) => r.migration_name)
  );

  const names = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((n) => fs.existsSync(path.join(MIGRATIONS_DIR, n, 'migration.sql')))
    .sort();

  const applyList = [];
  const runList = [];
  const reviewList = [];

  for (const name of names) {
    if (finished.has(name)) continue;

    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, name, 'migration.sql'),
      'utf8'
    );
    const { objects, unclassified } = extractObjects(sql);

    let present = 0;
    for (const object of objects) {
      if (await exists(object)) present += 1;
    }

    const total = objects.length;
    let verdict;

    if (unclassified.length > 0) {
      verdict = 'REVIEW  (unrecognised statements)';
      reviewList.push({ name, unclassified });
    } else if (total === 0) {
      verdict = 'REVIEW  (no objects found)';
      reviewList.push({ name, unclassified: ['(nothing parsed)'] });
    } else if (present === total) {
      verdict = 'PRESENT -> mark applied';
      applyList.push(name);
    } else if (present === 0) {
      verdict = 'ABSENT  -> let deploy run it';
      runList.push(name);
    } else {
      verdict = 'PARTIAL -> needs hand-finishing';
      reviewList.push({ name, unclassified: [`${present}/${total} objects present`] });
    }

    console.log(`${name.padEnd(52)} ${String(present)}/${String(total)}  ${verdict}`);
  }

  console.log('\n--- summary ---');
  console.log('already present :', applyList.length);
  console.log('genuinely new   :', runList.length);
  console.log('need review     :', reviewList.length);

  if (reviewList.length) {
    console.log('\nNeeds a human:');
    for (const r of reviewList) {
      console.log('  ' + r.name);
      r.unclassified.forEach((u) => console.log('      ' + u));
    }
  }

  if (applyList.length) {
    console.log('\nMark these applied (safe: every object already exists):\n');
    for (const name of applyList) {
      console.log(`npx prisma migrate resolve --applied ${name}`);
    }
    console.log('\nThen: npx prisma migrate deploy');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await prisma.$disconnect();
});
