import { Transaction, TransactionType } from '@/types/finance';
import { dayKeyOf, monthKeyOf } from '@/utils/date';

import { Db, TransactionRow } from './types';
import { applyRow, reverseRow } from './apply';
import { bumpDataVersion } from './version';
import { RollupInput } from './rollup-math';

/**
 * Transaction reads and writes.
 *
 * The one rule every write follows: never compute a diff. `updateTransaction`
 * reverses the old row's aggregate contribution in full and applies the new
 * one in full, rather than trying to patch only what changed — an edit can
 * move a transaction across month, category and account simultaneously, or
 * turn an expense into a transfer, and reversing in full is what makes that
 * correct with no case analysis (see `db/rollup-math.ts`).
 */

export function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    accountId: row.account_id,
    toAccountId: row.to_account_id ?? undefined,
    categoryId: row.category_id ?? undefined,
    subcategoryId: row.subcategory_id ?? undefined,
    payee: row.payee ?? undefined,
    date: row.date,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    recurringRuleId: row.recurring_rule_id ?? undefined,
    splitExpenseId: row.split_expense_id ?? undefined,
    splitCount: row.split_count ?? undefined,
    splitPendingCount: row.split_pending_count ?? undefined,
    splitOwedAmount: row.split_owed_amount ?? undefined,
    splitPaidAmount: row.split_paid_amount ?? undefined,
    splitOriginalPayee: row.split_original_payee ?? undefined,
    splitOriginalNote: row.split_original_note ?? undefined,
    splitOriginalCategoryId: row.split_original_category_id ?? undefined,
    splitOriginalCategoryName: row.split_original_category_name ?? undefined,
    splitOriginalAmount: row.split_original_amount ?? undefined,
  };
}


function toRollupInput(tx: Transaction): RollupInput {
  return {
    type: tx.type,
    amount: tx.amount,
    accountId: tx.accountId,
    toAccountId: tx.toAccountId ?? null,
    categoryId: tx.categoryId ?? null,
    monthKey: monthKeyOf(tx.date),
    dayKey: dayKeyOf(tx.date),
  };
}

const ROW_COLUMNS =
  'seq, id, type, amount, account_id, to_account_id, category_id, date, date_ms, month_key, day_key, note, note_lc, created_at, payee, subcategory_id, recurring_rule_id, split_expense_id';

const ROW_COLUMNS_WITH_SPLIT =
  'seq, id, type, amount, account_id, to_account_id, category_id, date, date_ms, month_key, day_key, note, note_lc, created_at, payee, subcategory_id, recurring_rule_id, split_expense_id, ' +
  '(SELECT COUNT(*) FROM split_participants sp WHERE sp.transaction_id = transactions.id) AS split_count, ' +
  '(SELECT COUNT(*) FROM split_participants sp WHERE sp.transaction_id = transactions.id AND sp.status = "pending") AS split_pending_count, ' +
  '(SELECT COALESCE(SUM(sp.share_amount), 0) FROM split_participants sp WHERE sp.transaction_id = transactions.id) AS split_owed_amount, ' +
  '(SELECT COALESCE(SUM(sp.paid_amount), 0) FROM split_participants sp WHERE sp.transaction_id = transactions.id) AS split_paid_amount, ' +
  '(SELECT payee FROM transactions orig WHERE orig.id = transactions.split_expense_id) AS split_original_payee, ' +
  '(SELECT note FROM transactions orig WHERE orig.id = transactions.split_expense_id) AS split_original_note, ' +
  '(SELECT category_id FROM transactions orig WHERE orig.id = transactions.split_expense_id) AS split_original_category_id, ' +
  '(SELECT c.name FROM transactions orig JOIN categories c ON c.id = orig.category_id WHERE orig.id = transactions.split_expense_id) AS split_original_category_name, ' +
  '(SELECT amount FROM transactions orig WHERE orig.id = transactions.split_expense_id) AS split_original_amount';

export interface TxCursor {
  dateMs: number;
  seq: number;
}

export interface TransactionFilter {
  type?: TransactionType;
  /** Matched against note text and against these category ids (resolved by name in JS). */
  search?: { needle: string; categoryIds: string[] };
}

export interface TransactionPage {
  rows: Transaction[];
  nextCursor: TxCursor | null;
}

/**
 * Keyset pagination, never OFFSET.
 *
 * `(date_ms, seq)` is the cursor because `date_ms` alone is not unique — two
 * transactions can share a timestamp — and without the tiebreak a page
 * boundary can skip or repeat a row. Measured against 1M rows: this stays at
 * ~0.1ms at any depth, where the OFFSET equivalent degrades linearly with how
 * far into the ledger the page is.
 */
export async function pageTransactions(
  db: Db,
  filter: TransactionFilter,
  cursor: TxCursor | null,
  limit = 60
): Promise<TransactionPage> {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter.type) {
    clauses.push('type = ?');
    params.push(filter.type);
  }

  if (filter.search && filter.search.needle) {
    const needleClauses = [`note_lc LIKE ?`];
    params.push(`%${filter.search.needle}%`);
    if (filter.search.categoryIds.length > 0) {
      needleClauses.push(`category_id IN (${filter.search.categoryIds.map(() => '?').join(',')})`);
      params.push(...filter.search.categoryIds);
    }
    clauses.push(`(${needleClauses.join(' OR ')})`);
  }

  if (cursor) {
    clauses.push('(date_ms, seq) < (?, ?)');
    params.push(cursor.dateMs, cursor.seq);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `SELECT ${ROW_COLUMNS_WITH_SPLIT} FROM transactions ${where} ORDER BY date_ms DESC, seq DESC LIMIT ?`;
  const rows = await db.getAllAsync<TransactionRow>(sql, [...params, limit + 1]);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];

  return {
    rows: page.map(rowToTransaction),
    nextCursor: hasMore && last ? { dateMs: last.date_ms, seq: last.seq } : null,
  };
}

export async function getTransactionById(db: Db, id: string): Promise<Transaction | null> {
  const row = await db.getFirstAsync<TransactionRow>(
    `SELECT ${ROW_COLUMNS_WITH_SPLIT} FROM transactions WHERE id = ? LIMIT 1`,
    [id]
  );
  return row ? rowToTransaction(row) : null;
}

/**
 * `all`/`income`/`expense`/`transfer` counts and nets, O(1) via `ledger_stat`
 * rather than a `COUNT(*)`/`SUM()` scan — the Activity header reads this on
 * every render.
 */
export async function getLedgerStat(
  db: Db,
  key: 'all' | TransactionType
): Promise<{ n: number; net: number }> {
  const row = await db.getFirstAsync<{ n: number; net: number }>(
    'SELECT n, net FROM ledger_stat WHERE key = ?',
    [key]
  );
  return { n: row?.n ?? 0, net: (row?.net ?? 0) / 100 };
}

/**
 * A filtered count/sum, for the search case where `ledger_stat` doesn't apply
 * (free-text search has unbounded cardinality, so it isn't pre-aggregated).
 * This is a real scan and is only ever called with a search needle active,
 * never on the unfiltered path.
 */
export async function countAndSumFiltered(
  db: Db,
  filter: TransactionFilter
): Promise<{ n: number; net: number }> {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter.type) {
    clauses.push('type = ?');
    params.push(filter.type);
  }
  if (filter.search && filter.search.needle) {
    const needleClauses = [`note_lc LIKE ?`];
    params.push(`%${filter.search.needle}%`);
    if (filter.search.categoryIds.length > 0) {
      needleClauses.push(`category_id IN (${filter.search.categoryIds.map(() => '?').join(',')})`);
      params.push(...filter.search.categoryIds);
    }
    clauses.push(`(${needleClauses.join(' OR ')})`);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const row = await db.getFirstAsync<{ n: number; net: number }>(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END), 0) AS net
     FROM transactions ${where}`,
    params
  );
  return { n: row?.n ?? 0, net: row?.net ?? 0 };
}

export async function insertTransaction(
  db: Db,
  tx: Omit<Transaction, 'createdAt'> & { createdAt?: string }
): Promise<void> {
  const monthKey = monthKeyOf(tx.date);
  const dayKey = dayKeyOf(tx.date);
  const dateMs = Date.parse(tx.date);
  const noteLc = tx.note ? tx.note.toLowerCase() : null;
  const createdAt = tx.createdAt ?? new Date().toISOString();

  await db.withTransaction(async txn => {
    await txn.runAsync(
      `INSERT INTO transactions
         (id, type, amount, account_id, to_account_id, category_id,
          date, date_ms, month_key, day_key, note, note_lc, created_at,
          payee, subcategory_id, recurring_rule_id, split_expense_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tx.id,
        tx.type,
        tx.amount,
        tx.accountId,
        tx.toAccountId ?? null,
        tx.categoryId ?? null,
        tx.date,
        dateMs,
        monthKey,
        dayKey,
        tx.note ?? null,
        noteLc,
        createdAt,
        tx.payee ?? null,
        tx.subcategoryId ?? null,
        tx.recurringRuleId ?? null,
        tx.splitExpenseId ?? null,
      ]
    );
    await applyRow(txn, toRollupInput({ ...tx, createdAt }));
  });
  bumpDataVersion();
}

const BULK_INSERT_COLUMNS =
  'id, type, amount, account_id, to_account_id, category_id, date, date_ms, month_key, day_key, note, note_lc, created_at, payee, subcategory_id, recurring_rule_id, split_expense_id';
const BULK_INSERT_PLACEHOLDERS = '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';

/**
 * Inserts many rows with multi-row batched statements instead of one
 * `runAsync` per row, and skips the incremental rollup math entirely —
 * `applyRow`'s per-row upserts don't scale to a bulk load. Callers must run
 * `rebuildRollups(db)` once after every batch is in, which does the
 * equivalent aggregation in a single SQL pass over the whole table rather
 * than millions of individual updates.
 *
 * `OR IGNORE` makes this double as "insert what's new" for a merge: a row
 * whose id already exists is silently skipped rather than erroring, so
 * calling this against a table that already has data (not just an empty one
 * being bulk-loaded) is exactly "add anything new, keep what's there."
 *
 * All of it runs inside one `db.withTransaction` — without it, each
 * statement auto-commits on its own, and on the web (WASM/OPFS) backend
 * every commit is a real flush to persistent storage, not just an in-memory
 * checkpoint; wrapping the whole call in one transaction turns hundreds of
 * those flushes into one. `withTransaction`'s nesting support (see
 * `db/client.ts`) means a caller that already has its own transaction open
 * (e.g. batching several calls together) gets this for free rather than a
 * second, redundant transaction.
 *
 * The batch size itself matters more than that transaction wrap once a
 * real device is involved: each `runAsync` call crosses the JS↔native
 * bridge, and that round trip — not statement execution — is what actually
 * dominates wall time on-device. A conservative 70-row batch (measured:
 * ~2,000 rows/sec on a real device, vs. the desktop `node:sqlite`
 * benchmark's 20-25k/sec, where there is no bridge to cross) means paying
 * that round-trip cost far more often than necessary. 800 rows per
 * statement (10,400 bound parameters) cuts the number of round trips ~11x
 * while staying comfortably under modern SQLite's default
 * `SQLITE_MAX_VARIABLE_NUMBER` (32,766). If a batch is ever rejected with
 * "too many SQL variables" — an older/differently-configured SQLite build —
 * it's retried at a quarter the size, and that smaller size sticks for the
 * rest of the call rather than re-discovering it every batch.
 */
function isTooManyVariablesError(e: unknown): boolean {
  return e instanceof Error && /too many sql variables/i.test(e.message);
}

export async function bulkInsertTransactionRows(
  db: Db,
  rows: Iterable<Transaction> | AsyncIterable<Transaction>,
  batchSize = 800
): Promise<number> {
  let batch: Transaction[] = [];
  let total = 0;
  let currentBatchSize = batchSize;

  await db.withTransaction(async txn => {
    const insertChunk = async (chunk: Transaction[]) => {
      const sql = `INSERT OR IGNORE INTO transactions (${BULK_INSERT_COLUMNS})
        VALUES ${chunk.map(() => BULK_INSERT_PLACEHOLDERS).join(',')}`;
      const params: (string | number | null)[] = [];
      for (const tx of chunk) {
        params.push(
          tx.id,
          tx.type,
          tx.amount,
          tx.accountId,
          tx.toAccountId ?? null,
          tx.categoryId ?? null,
          tx.date,
          Date.parse(tx.date),
          monthKeyOf(tx.date),
          dayKeyOf(tx.date),
          tx.note ?? null,
          tx.note ? tx.note.toLowerCase() : null,
          tx.createdAt,
          tx.payee ?? null,
          tx.subcategoryId ?? null,
          tx.recurringRuleId ?? null,
          tx.splitExpenseId ?? null
        );
      }
      await txn.runAsync(sql, params);
    };

    const flush = async () => {
      let remaining = batch;
      while (remaining.length > 0) {
        const chunk = remaining.slice(0, currentBatchSize);
        try {
          await insertChunk(chunk);
          total += chunk.length;
          remaining = remaining.slice(chunk.length);
        } catch (e) {
          if (isTooManyVariablesError(e) && currentBatchSize > 10) {
            currentBatchSize = Math.max(10, Math.floor(currentBatchSize / 4));
            continue;
          }
          throw e;
        }
      }
      batch = [];
    };

    for await (const tx of rows) {
      batch.push(tx);
      if (batch.length >= currentBatchSize) await flush();
    }
    await flush();
  });

  return total;
}

export async function updateTransaction(db: Db, next: Transaction): Promise<void> {
  await db.withTransaction(async txn => {
    const oldRow = await txn.getFirstAsync<TransactionRow>(
      `SELECT ${ROW_COLUMNS} FROM transactions WHERE id = ?`,
      [next.id]
    );
    if (!oldRow) throw new Error(`updateTransaction: no transaction with id ${next.id}`);

    await reverseRow(txn, toRollupInput(rowToTransaction(oldRow)));

    const monthKey = monthKeyOf(next.date);
    const dayKey = dayKeyOf(next.date);
    const dateMs = Date.parse(next.date);
    const noteLc = next.note ? next.note.toLowerCase() : null;

    await txn.runAsync(
      `UPDATE transactions SET
         type = ?, amount = ?, account_id = ?, to_account_id = ?, category_id = ?,
         date = ?, date_ms = ?, month_key = ?, day_key = ?, note = ?, note_lc = ?,
         payee = ?, subcategory_id = ?, recurring_rule_id = ?, split_expense_id = ?
       WHERE id = ?`,
      [
        next.type,
        next.amount,
        next.accountId,
        next.toAccountId ?? null,
        next.categoryId ?? null,
        next.date,
        dateMs,
        monthKey,
        dayKey,
        next.note ?? null,
        noteLc,
        next.payee ?? null,
        next.subcategoryId ?? null,
        next.recurringRuleId ?? null,
        next.splitExpenseId ?? null,
        next.id,
      ]
    );

    await applyRow(txn, toRollupInput(next));
  });
  bumpDataVersion();
}

export async function deleteTransaction(db: Db, id: string): Promise<void> {
  await db.withTransaction(async txn => {
    const row = await txn.getFirstAsync<TransactionRow>(
      `SELECT ${ROW_COLUMNS} FROM transactions WHERE id = ?`,
      [id]
    );
    if (!row) return;

    await reverseRow(txn, toRollupInput(rowToTransaction(row)));
    await txn.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
  });
  bumpDataVersion();
}

/** Every transaction touching this account, for the scoped rollup rebuild an account delete needs. */
export async function monthKeysTouchingAccount(db: Db, accountId: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ month_key: string }>(
    'SELECT DISTINCT month_key FROM transactions WHERE account_id = ? OR to_account_id = ?',
    [accountId, accountId]
  );
  return rows.map(r => r.month_key);
}

/**
 * Every transaction, oldest first, one at a time. Backs full-ledger export
 * (`utils/data-transfer-io.ts`) — `getEachAsync` streams rows from SQLite
 * without materializing the whole result set, and this generator doesn't
 * either, so peak memory during an export stays O(1) in the ledger size
 * regardless of whether it holds a thousand rows or ten million.
 */
export async function* iterateTransactions(db: Db): AsyncGenerator<Transaction> {
  for await (const row of db.getEachAsync<TransactionRow>(
    `SELECT ${ROW_COLUMNS} FROM transactions ORDER BY seq ASC`
  )) {
    yield rowToTransaction(row);
  }
}

/** Newest N transactions, optionally for one account (either leg of a transfer counts). For Home's "recent activity" list. */
export async function getRecentTransactions(db: Db, accountId: string | null, limit = 4): Promise<Transaction[]> {
  if (!accountId) {
    const rows = await db.getAllAsync<TransactionRow>(
      `SELECT ${ROW_COLUMNS_WITH_SPLIT} FROM transactions ORDER BY date_ms DESC, seq DESC LIMIT ?`,
      [limit]
    );
    return rows.map(rowToTransaction);
  }
  const rows = await db.getAllAsync<TransactionRow>(
    `SELECT ${ROW_COLUMNS_WITH_SPLIT} FROM transactions WHERE account_id = ? OR to_account_id = ?
     ORDER BY date_ms DESC, seq DESC LIMIT ?`,
    [accountId, accountId, limit]
  );
  return rows.map(rowToTransaction);
}

/** Fetches all repayment transactions recorded for a given split expense ID. */
export async function getRepaymentsForSplit(db: Db, splitExpenseId: string): Promise<Transaction[]> {
  const rows = await db.getAllAsync<TransactionRow>(
    `SELECT ${ROW_COLUMNS_WITH_SPLIT} FROM transactions WHERE split_expense_id = ? ORDER BY date_ms DESC, seq DESC`,
    [splitExpenseId]
  );
  return rows.map(rowToTransaction);
}
