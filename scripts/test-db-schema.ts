/**
 * Schema, migrations, and — most importantly — query plans.
 *
 * The plan assertions are the highest-value tests here. They run in
 * milliseconds against an empty database and are the only thing that catches
 * an accidentally-unindexed query *before* it meets a real ledger. A query
 * that falls back to an unindexed `SCAN transactions`, or that needs a temp
 * b-tree to sort, is O(rows) — precisely the failure this migration exists to
 * remove.
 *
 * What they cannot catch: two queries with identical plans but different
 * costs, the important case being keyset pagination versus `OFFSET`. Both
 * report an indexed scan. That difference only shows up as a timing ratio, so
 * it belongs to the benchmark, not here.
 */
import { applyMigrations, getSchemaVersion, getMeta, setMeta, LATEST_SCHEMA_VERSION } from '../db/schema';
import { Db } from '../db/types';
import { openTestDb } from './support/node-db';
import { Case, eq, runCases } from './support/harness';

async function fresh(): Promise<Db> {
  const db = openTestDb();
  await applyMigrations(db);
  return db;
}

/** The plan for a statement, flattened to one string. */
async function plan(db: Db, sql: string, params: (string | number | null)[] = []): Promise<string> {
  const rows = await db.getAllAsync<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, params);
  return rows.map(r => r.detail).join(' | ');
}

/**
 * What actually makes a plan acceptable.
 *
 * `SCAN transactions USING INDEX idx_tx_date` is *fine* for an unfiltered
 * `ORDER BY date_ms DESC LIMIT 60`: it walks the index in order and stops at
 * 60 rows, so it costs O(limit), not O(rows). The failure to catch is a scan
 * with no index at all, or a temp b-tree, which means SQLite is materialising
 * and sorting the whole table before it can return the first page.
 */
function usesIndex(detail: string, index: string): string | null {
  if (!detail.includes(index)) return `expected plan to use ${index}, got: ${detail}`;
  if (/SCAN transactions(?! USING)/.test(detail)) {
    return `plan falls back to an unindexed full scan: ${detail}`;
  }
  if (detail.includes('USE TEMP B-TREE')) {
    return `plan needs a temp b-tree, so it sorts the whole table: ${detail}`;
  }
  return null;
}

const CASES: Case[] = [
  {
    name: 'sqlite is new enough for row values, upsert and WITHOUT ROWID',
    run: async () => {
      const db = openTestDb();
      const row = await db.getFirstAsync<{ v: string }>('SELECT sqlite_version() AS v');
      const [major, minor] = (row?.v ?? '0.0').split('.').map(Number);
      // Row-value comparisons need 3.15; upsert needs 3.24.
      const ok = major > 3 || (major === 3 && minor >= 24);
      return ok ? null : `sqlite ${row?.v} is too old (need >= 3.24)`;
    },
  },
  {
    name: 'migrations apply from scratch and set user_version',
    run: async () => {
      const db = openTestDb();
      const before = await getSchemaVersion(db);
      await applyMigrations(db);
      const after = await getSchemaVersion(db);
      return eq('before', before, 0) ?? eq('after', after, LATEST_SCHEMA_VERSION);
    },
  },
  {
    name: 'running migrations twice is a no-op',
    run: async () => {
      const db = await fresh();
      await applyMigrations(db);
      await applyMigrations(db);
      const version = await getSchemaVersion(db);
      const stats = await db.getAllAsync<{ key: string }>('SELECT key FROM ledger_stat');
      // A re-run that replayed the migration would either throw on CREATE
      // TABLE or duplicate the seeded ledger_stat rows.
      return eq('version', version, LATEST_SCHEMA_VERSION) ?? eq('ledger_stat rows', stats.length, 4);
    },
  },
  {
    name: 'ledger_stat is seeded with the four keys the header reads',
    run: async () => {
      const db = await fresh();
      const rows = await db.getAllAsync<{ key: string; n: number; net: number }>(
        'SELECT key, n, net FROM ledger_stat ORDER BY key'
      );
      return (
        eq('keys', rows.map(r => r.key).join(','), 'all,expense,income,transfer') ??
        eq('all n', rows.find(r => r.key === 'all')?.n, 0)
      );
    },
  },
  {
    name: 'meta round-trips and upserts rather than duplicating',
    run: async () => {
      const db = await fresh();
      await setMeta(db, 'keys_tz', 'Asia/Kolkata');
      await setMeta(db, 'keys_tz', 'Europe/London');
      const value = await getMeta(db, 'keys_tz');
      const missing = await getMeta(db, 'nope');
      return eq('value', value, 'Europe/London') ?? eq('missing', missing, null);
    },
  },
  {
    name: 'foreign keys are enforced (a transaction needs a real account)',
    run: async () => {
      const db = await fresh();
      try {
        await db.runAsync(
          `INSERT INTO transactions (id,type,amount,account_id,date,date_ms,month_key,day_key,created_at)
           VALUES ('t1','expense',10,'ghost','2026-08-01T00:00:00.000Z',0,'2026-08','2026-08-01','2026-08-01T00:00:00.000Z')`
        );
        return 'expected a foreign key violation, insert succeeded';
      } catch {
        return null;
      }
    },
  },
  {
    name: 'type and kind CHECK constraints reject bad values',
    run: async () => {
      const db = await fresh();
      try {
        await db.runAsync(
          `INSERT INTO categories (id,name,icon,color,kind) VALUES ('c1','X','cart','#000','sideways')`
        );
        return 'expected a CHECK violation on categories.kind';
      } catch {
        return null;
      }
    },
  },
  {
    name: 'the id unique index makes a duplicate id a hard error, not a silent dupe',
    run: async () => {
      const db = await fresh();
      await db.runAsync(
        `INSERT INTO accounts (id,name,type,icon,color,created_at) VALUES ('a1','A','bank','business','#000','x')`
      );
      const insert = `INSERT INTO transactions (id,type,amount,account_id,date,date_ms,month_key,day_key,created_at)
        VALUES ('dup','expense',10,'a1','2026-08-01T00:00:00.000Z',0,'2026-08','2026-08-01','x')`;
      await db.runAsync(insert);
      try {
        await db.runAsync(insert);
        return 'expected a UNIQUE violation on transactions.id';
      } catch {
        return null;
      }
    },
  },

  // ---- Query plans: the tests that keep this O(log n) ----
  {
    name: 'PLAN: first Activity page uses the date index with no sorter',
    run: async () => {
      const db = await fresh();
      const detail = await plan(
        db,
        'SELECT * FROM transactions ORDER BY date_ms DESC, seq DESC LIMIT 60'
      );
      return usesIndex(detail, 'idx_tx_date');
    },
  },
  {
    // Note on what this does and does not prove: SQLite reports the same plan
    // (`SCAN transactions USING INDEX idx_tx_date`) for the keyset predicate
    // and for `LIMIT 60 OFFSET 500000`, because the difference between them is
    // cost, not strategy — OFFSET walks and discards every skipped entry. The
    // plan tests here catch a *missing index*; the keyset-vs-OFFSET gap is
    // covered by the ratio assertions in the benchmark instead.
    name: 'PLAN: keyset page resolves against the date index',
    run: async () => {
      const db = await fresh();
      const detail = await plan(
        db,
        `SELECT * FROM transactions
         WHERE (date_ms, seq) < (?, ?)
         ORDER BY date_ms DESC, seq DESC LIMIT 60`,
        [0, 0]
      );
      return usesIndex(detail, 'idx_tx_date');
    },
  },
  {
    name: 'PLAN: filtered keyset page uses the type+date index',
    run: async () => {
      const db = await fresh();
      const detail = await plan(
        db,
        `SELECT * FROM transactions
         WHERE type = ? AND (date_ms, seq) < (?, ?)
         ORDER BY date_ms DESC, seq DESC LIMIT 60`,
        ['expense', 0, 0]
      );
      return usesIndex(detail, 'idx_tx_type_date');
    },
  },
  {
    name: 'PLAN: transaction lookup by id uses the unique index, not a scan',
    run: async () => {
      const db = await fresh();
      const detail = await plan(db, 'SELECT * FROM transactions WHERE id = ? LIMIT 1', ['x']);
      return detail.includes('SCAN transactions') ? `full scan for an id lookup: ${detail}` : null;
    },
  },
  {
    name: 'PLAN: month summary reads the rollup, never the transactions table',
    run: async () => {
      const db = await fresh();
      const detail = await plan(
        db,
        `SELECT SUM(income) AS income, SUM(expense) AS expense
         FROM rollup WHERE grain = 'M' AND bucket = ?`,
        ['2026-08']
      );
      if (detail.includes('transactions')) return `month summary touched transactions: ${detail}`;
      return detail.includes('rollup') ? null : `expected a rollup plan, got: ${detail}`;
    },
  },
  {
    name: 'PLAN: category breakdown over a bucket range stays on the rollup index',
    run: async () => {
      const db = await fresh();
      const detail = await plan(
        db,
        `SELECT category_id, SUM(expense) AS total FROM rollup
         WHERE grain = 'D' AND bucket BETWEEN ? AND ?
         GROUP BY category_id`,
        ['2026-01-01', '2026-12-31']
      );
      if (detail.includes('transactions')) return `breakdown touched transactions: ${detail}`;
      return detail.includes('rollup') ? null : `expected a rollup plan, got: ${detail}`;
    },
  },
  {
    name: 'PLAN: account balance is a primary-key lookup',
    run: async () => {
      const db = await fresh();
      const detail = await plan(db, 'SELECT delta FROM account_balance WHERE account_id = ?', ['a1']);
      return detail.includes('SCAN') ? `balance read is a scan: ${detail}` : null;
    },
  },
  {
    name: 'PLAN: ledger_stat header read is a primary-key lookup',
    run: async () => {
      const db = await fresh();
      const detail = await plan(db, 'SELECT n, net FROM ledger_stat WHERE key = ?', ['all']);
      return detail.includes('SCAN') ? `header read is a scan: ${detail}` : null;
    },
  },
];

runCases(CASES, 'schema cases');
