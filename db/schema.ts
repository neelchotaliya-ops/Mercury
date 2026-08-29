import { Db } from './types';

/**
 * Schema and migrations, tracked by `PRAGMA user_version`.
 *
 * Migrations are append-only: add a new entry, never edit a shipped one. Each
 * runs inside a transaction and bumps `user_version` to its index + 1.
 */

/**
 * Why `seq INTEGER PRIMARY KEY AUTOINCREMENT` alongside `id TEXT UNIQUE`,
 * rather than making the text id the primary key:
 *
 * 1. It reproduces the current ordering exactly. The reducer's
 *    `insertSortedDesc` places a newly added transaction *before* existing
 *    ones sharing its timestamp, so `ORDER BY date_ms DESC, seq DESC` gives
 *    byte-identical results — a higher `seq` means a later insert. Tie-breaking
 *    on the text id instead would order arbitrarily, because `generateId()`
 *    ids are not lexicographically sortable (the `Date.now().toString(36)`
 *    prefix changes width over time).
 * 2. Every secondary index carries the primary key. An 8-byte integer beats a
 *    ~17-byte string across five indexes and millions of rows.
 * 3. Keyset pagination needs a stable, unique tiebreak column, and `date_ms`
 *    alone is not unique.
 *
 * `month_key` and `day_key` are stored, not derived. Dates persist as UTC ISO
 * strings, so the calendar month cannot be read off the string: east of UTC a
 * transaction logged just after local midnight carries the previous UTC day.
 * They are computed once at write time by the same `monthKeyOf`/`dayKeyOf`
 * helpers the app already uses, so there is exactly one implementation of
 * "which month is this in". SQLite's own `localtime` modifier is deliberately
 * not used — it is non-deterministic (so it cannot back a generated column)
 * and would be a second implementation that can disagree with JS at historical
 * DST boundaries.
 *
 * `sort_order` exists because JS arrays have an implicit order the app relies
 * on — `accounts[0]` is the default account, the hero shows `slice(0, 4)` —
 * and SQL has no implicit order. Without it, rows come back in whatever order
 * the query planner likes and users see their accounts silently rearrange.
 */
const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) WITHOUT ROWID;

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) WITHOUT ROWID;

  CREATE TABLE accounts (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT NOT NULL,
    icon            TEXT NOT NULL,
    color           TEXT NOT NULL,
    initial_balance REAL NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    archived        INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL,
    color      TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('income','expense')),
    is_default INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE transactions (
    seq           INTEGER PRIMARY KEY AUTOINCREMENT,
    id            TEXT    NOT NULL UNIQUE,
    type          TEXT    NOT NULL CHECK (type IN ('income','expense','transfer')),
    amount        REAL    NOT NULL,
    account_id    TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id TEXT             REFERENCES accounts(id) ON DELETE CASCADE,
    category_id   TEXT             REFERENCES categories(id) ON DELETE SET NULL,
    date          TEXT    NOT NULL,
    date_ms       INTEGER NOT NULL,
    month_key     TEXT    NOT NULL,
    day_key       TEXT    NOT NULL,
    note          TEXT,
    note_lc       TEXT,
    created_at    TEXT    NOT NULL
  );

  CREATE TABLE budgets (
    id            TEXT PRIMARY KEY,
    category_id   TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    monthly_limit REAL NOT NULL,
    created_at    TEXT NOT NULL,
    sort_order    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE quick_presets (
    id          TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    emoji       TEXT NOT NULL,
    amount      REAL NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('income','expense')),
    category_id TEXT,
    account_id  TEXT,
    sort_order  INTEGER NOT NULL DEFAULT 0
  );

  -- Indexes are declared ASC. SQLite walks an index backwards natively, so
  -- "ORDER BY date_ms DESC, seq DESC" resolves against these with no sorter;
  -- a DESC index would buy nothing and is easy to get half-wrong on composites.
  CREATE INDEX idx_tx_date      ON transactions(date_ms, seq);
  CREATE INDEX idx_tx_type_date ON transactions(type, date_ms, seq);
  CREATE INDEX idx_tx_acct_date ON transactions(account_id, date_ms, seq);
  CREATE INDEX idx_tx_to_date   ON transactions(to_account_id, date_ms, seq)
    WHERE to_account_id IS NOT NULL;
  CREATE INDEX idx_tx_cat_date  ON transactions(category_id, date_ms, seq)
    WHERE category_id IS NOT NULL;
  -- Only used by rebuild/repair; the read path goes through the rollup.
  CREATE INDEX idx_tx_month     ON transactions(month_key);
  CREATE INDEX idx_tx_day       ON transactions(day_key);

  -- Pre-aggregated totals. One row per (grain, bucket, account, category,
  -- type-ish) cell, maintained incrementally inside the same transaction as
  -- every write. This is what keeps Insights O(buckets) instead of O(rows):
  -- a million transactions collapse to a few hundred cells, so the charts
  -- cost the same at 10M rows as at 10k.
  --
  -- Two grains in one table rather than two tables: one upsert path, one
  -- rebuild, one negation, one test surface. 'grain' leads the primary key,
  -- so each grain's rows are physically contiguous in a WITHOUT ROWID table.
  --
  -- Both grains exist because the Insights date ranges do not align to month
  -- boundaries ('30 days' starts mid-month, and every preset ends today), so
  -- summing months would over-count the partial edges. Month grain is used
  -- only for 'all time'.
  CREATE TABLE rollup (
    grain          TEXT NOT NULL CHECK (grain IN ('M','D')),
    bucket         TEXT NOT NULL,
    account_id     TEXT NOT NULL,
    category_id    TEXT NOT NULL,
    income         INTEGER NOT NULL DEFAULT 0,
    expense        INTEGER NOT NULL DEFAULT 0,
    transfer_in    INTEGER NOT NULL DEFAULT 0,
    transfer_out   INTEGER NOT NULL DEFAULT 0,
    income_count   INTEGER NOT NULL DEFAULT 0,
    expense_count  INTEGER NOT NULL DEFAULT 0,
    transfer_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (grain, bucket, account_id, category_id)
  ) WITHOUT ROWID;

  CREATE INDEX idx_rollup_cat  ON rollup(grain, category_id, bucket);
  CREATE INDEX idx_rollup_acct ON rollup(grain, account_id, bucket);

  -- Balances are the hottest read in the app (every Home render, every
  -- Accounts render, every widget redraw), so they get their own O(1) row
  -- rather than a GROUP BY over the rollup. 'delta' excludes initial_balance
  -- so editing an account's opening balance touches only the accounts table.
  CREATE TABLE account_balance (
    account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    delta      INTEGER NOT NULL DEFAULT 0
  ) WITHOUT ROWID;

  -- Activity's "N entries · X net" header. Answering it with COUNT(*) would
  -- be an index scan on every render (~400ms at 10M rows); four delta-updated
  -- rows make it O(1). 'net' follows the screen's existing semantics: income
  -- positive, expense negative, transfers counted but contributing zero.
  CREATE TABLE ledger_stat (
    key TEXT PRIMARY KEY,
    n   INTEGER NOT NULL DEFAULT 0,
    net INTEGER NOT NULL DEFAULT 0
  ) WITHOUT ROWID;

  INSERT INTO ledger_stat (key, n, net) VALUES
    ('all', 0, 0), ('income', 0, 0), ('expense', 0, 0), ('transfer', 0, 0);
  `,

  // v2 — multi-currency per account and account-bound budgets
  `
  ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';
  ALTER TABLE budgets ADD COLUMN account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE;
  ALTER TABLE budgets ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';
  `,

  // v3 — subcategories table + payee / subcategory_id on transactions
  //
  // payee is free-text (merchant name). subcategory_id is optional structure
  // on top of the flat category. The rollup stays on category_id only —
  // subcategory/payee filtering uses bounded raw scans (same as minAmount).
  `
  CREATE TABLE subcategories (
    id          TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    icon        TEXT NOT NULL,
    color       TEXT NOT NULL,
    is_default  INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0
  );

  ALTER TABLE transactions ADD COLUMN payee TEXT;
  ALTER TABLE transactions ADD COLUMN subcategory_id TEXT REFERENCES subcategories(id) ON DELETE SET NULL;

  CREATE INDEX idx_tx_payee   ON transactions(payee) WHERE payee IS NOT NULL;
  CREATE INDEX idx_tx_subcat  ON transactions(subcategory_id) WHERE subcategory_id IS NOT NULL;
  CREATE INDEX idx_subcat_cat ON subcategories(category_id);
  `,

  // v4 — recurring rules + link column on transactions
  //
  // Each rule stores the full recurrence shape (frequency, interval, day
  // anchors, start/end dates) and the next due date as a precomputed ISO
  // string. Processing runs on foreground, computing new due dates in JS
  // (utils/recurring-engine.ts) rather than in SQL.
  `
  CREATE TABLE recurring_rules (
    id             TEXT PRIMARY KEY,
    type           TEXT    NOT NULL CHECK (type IN ('income','expense')),
    amount         REAL    NOT NULL,
    account_id     TEXT    NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    category_id    TEXT             REFERENCES categories(id) ON DELETE SET NULL,
    subcategory_id TEXT             REFERENCES subcategories(id) ON DELETE SET NULL,
    payee          TEXT,
    note           TEXT,
    frequency      TEXT    NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly','custom')),
    -- For 'custom' frequency: the numeric value and its unit
    interval_unit  TEXT    CHECK (interval_unit IN ('day','week','month','year')),
    interval_value INTEGER,
    -- For 'weekly': 0=Sun … 6=Sat
    day_of_week    INTEGER,
    -- For 'monthly': 1–31, or -1 for last day of month
    day_of_month   INTEGER,
    start_date     TEXT    NOT NULL,
    end_date       TEXT,
    next_due       TEXT    NOT NULL,
    -- 0 = create pending transaction (user confirms); 1 = create silently
    auto_create    INTEGER NOT NULL DEFAULT 0,
    -- Days before next_due to fire a reminder notification
    reminder_days  INTEGER NOT NULL DEFAULT 1,
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT    NOT NULL
  );

  ALTER TABLE transactions ADD COLUMN recurring_rule_id TEXT REFERENCES recurring_rules(id) ON DELETE SET NULL;

  CREATE INDEX idx_recurring_next ON recurring_rules(next_due) WHERE active = 1;
  CREATE INDEX idx_tx_recurring   ON transactions(recurring_rule_id) WHERE recurring_rule_id IS NOT NULL;
  `,

  // v5 — split participants + link column on transactions
  //
  // A shared expense is a normal 'expense' transaction. split_participants
  // tracks each person's share. Repayments are separate 'income' transactions
  // linked back via split_expense_id, so they don't float as mystery income.
  `
  CREATE TABLE split_participants (
    id             TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    share_amount   REAL NOT NULL,
    paid_amount    REAL NOT NULL DEFAULT 0,
    -- Derived status; kept explicit so it can be indexed and filtered cheaply
    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','partial','paid')),
    note           TEXT,
    settled_at     TEXT,
    created_at     TEXT NOT NULL
  );

  -- Links a repayment income transaction back to the original shared expense
  ALTER TABLE transactions ADD COLUMN split_expense_id TEXT REFERENCES transactions(id) ON DELETE SET NULL;

  CREATE INDEX idx_split_tx     ON split_participants(transaction_id);
  CREATE INDEX idx_split_status ON split_participants(transaction_id, status);
  CREATE INDEX idx_tx_split_ref ON transactions(split_expense_id) WHERE split_expense_id IS NOT NULL;
  `,

  // v6 — split settles as a single paid/not-paid toggle, not partial payments
  //
  // Split moved from tracking a running paid_amount against a
  // pending/partial/paid tri-state to one action: a participant either owes
  // their full share or has paid it. Existing 'partial' rows are folded into
  // 'paid' (if enough was already recorded as paid) or back to 'pending'
  // otherwise. The CHECK constraint on `status` still technically allows
  // 'partial' — SQLite can't narrow a CHECK without rebuilding the table —
  // but no code path writes it anymore.
  `
  UPDATE split_participants
  SET status = CASE WHEN paid_amount >= share_amount THEN 'paid' ELSE 'pending' END,
      paid_amount = CASE WHEN paid_amount >= share_amount THEN share_amount ELSE 0 END
  WHERE status = 'partial';
  `,
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Brings a database up to the latest schema version.
 *
 * Idempotent and cheap when there is nothing to do, which matters because the
 * Android widget runs in a headless task that can start before the app has
 * ever launched — it calls this too rather than assuming the app got there
 * first.
 */
export async function applyMigrations(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current >= MIGRATIONS.length) return current;

  for (let version = current; version < MIGRATIONS.length; version++) {
    const sql = MIGRATIONS[version];
    await db.withTransaction(async txn => {
      await txn.execAsync(sql);
      // PRAGMA does not accept bound parameters; the value is a loop index.
      await txn.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }

  return MIGRATIONS.length;
}

/**
 * The transactions table's secondary indexes — everything except the
 * implicit `seq` primary key and the `id` UNIQUE index, which a bulk load
 * cannot drop (`bulkInsertTransactionRows`'s `INSERT OR IGNORE` dedup, and
 * therefore merge-import and re-running a cancelled fill, both rely on it
 * staying enforced).
 *
 * Maintaining 7 indexes on every inserted row is the dominant cost of a
 * bulk load — each row write becomes 7 extra B-tree insertions on top of
 * the table write itself. Dropping these before a large load and rebuilding
 * them once after (a single sorted bulk build, not millions of
 * random-access insertions) is the standard SQLite technique for this, and
 * is what actually moves the needle for "fill 100M rows" — batching
 * statement size (see `bulkInsertTransactionRows`) helps too, but doesn't
 * touch this cost, which scales with row count regardless of how the rows
 * are grouped into statements.
 */
const BULK_INDEXES: { name: string; create: string }[] = [
  { name: 'idx_tx_date', create: 'CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date_ms, seq)' },
  {
    name: 'idx_tx_type_date',
    create: 'CREATE INDEX IF NOT EXISTS idx_tx_type_date ON transactions(type, date_ms, seq)',
  },
  {
    name: 'idx_tx_acct_date',
    create: 'CREATE INDEX IF NOT EXISTS idx_tx_acct_date ON transactions(account_id, date_ms, seq)',
  },
  {
    name: 'idx_tx_to_date',
    create:
      'CREATE INDEX IF NOT EXISTS idx_tx_to_date ON transactions(to_account_id, date_ms, seq) WHERE to_account_id IS NOT NULL',
  },
  {
    name: 'idx_tx_cat_date',
    create:
      'CREATE INDEX IF NOT EXISTS idx_tx_cat_date ON transactions(category_id, date_ms, seq) WHERE category_id IS NOT NULL',
  },
  { name: 'idx_tx_month', create: 'CREATE INDEX IF NOT EXISTS idx_tx_month ON transactions(month_key)' },
  { name: 'idx_tx_day', create: 'CREATE INDEX IF NOT EXISTS idx_tx_day ON transactions(day_key)' },
];

function isTableLockedError(e: unknown): boolean {
  return e instanceof Error && /database table is locked/i.test(e.message);
}

/**
 * `PRAGMA busy_timeout` (set in `db/client.ts`) covers `SQLITE_BUSY` —
 * contention with the widget's separate connection — but a DDL statement
 * like `DROP`/`CREATE INDEX` can instead hit `SQLITE_LOCKED` ("database
 * table is locked"), which happens when some other statement on this same
 * connection still has an open cursor against the table being altered
 * (e.g. a query hook's read that was mid-flight). `busy_timeout` doesn't
 * retry that case on its own, and it should resolve itself as soon as that
 * other statement finishes, so a short bounded retry here is the
 * appropriate fix — not a sign anything is actually stuck.
 */
async function execWithLockRetry(db: Db, sql: string): Promise<void> {
  const attempts = 5;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await db.execAsync(sql);
      return;
    } catch (e) {
      if (!isTableLockedError(e) || attempt === attempts) throw e;
      await new Promise(resolve => setTimeout(resolve, attempt * 100));
    }
  }
}

/** Drops the transactions table's secondary indexes ahead of a large bulk load. Safe to call when they're already missing. */
export async function dropBulkIndexes(db: Db): Promise<void> {
  for (const idx of BULK_INDEXES) {
    await execWithLockRetry(db, `DROP INDEX IF EXISTS ${idx.name}`);
  }
}

/**
 * Rebuilds whichever bulk indexes are missing. Always call this after a
 * `dropBulkIndexes`-guarded bulk load; it's also called once on every
 * `open()` (see `db/client.ts`), which is what repairs a database left
 * mid-drop by a crash or a killed app — cheap when nothing is missing,
 * since `CREATE INDEX IF NOT EXISTS` is just a catalog check.
 */
export async function ensureBulkIndexes(db: Db): Promise<void> {
  for (const idx of BULK_INDEXES) {
    await execWithLockRetry(db, idx.create);
  }
}

export async function getSchemaVersion(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

export async function getMeta(db: Db, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [
    key,
  ]);
  return row?.value ?? null;
}

export async function setMeta(db: Db, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}
