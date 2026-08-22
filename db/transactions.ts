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
    date: row.date,
    note: row.note ?? undefined,
    createdAt: row.created_at,
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
  'seq, id, type, amount, account_id, to_account_id, category_id, date, date_ms, month_key, day_key, note, note_lc, created_at';

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
  const sql = `SELECT ${ROW_COLUMNS} FROM transactions ${where} ORDER BY date_ms DESC, seq DESC LIMIT ?`;
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
    `SELECT ${ROW_COLUMNS} FROM transactions WHERE id = ? LIMIT 1`,
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

export async function insertTransaction(db: Db, tx: Transaction): Promise<void> {
  const monthKey = monthKeyOf(tx.date);
  const dayKey = dayKeyOf(tx.date);
  const dateMs = Date.parse(tx.date);
  const noteLc = tx.note ? tx.note.toLowerCase() : null;

  await db.withTransaction(async txn => {
    await txn.runAsync(
      `INSERT INTO transactions
         (id, type, amount, account_id, to_account_id, category_id, date, date_ms, month_key, day_key, note, note_lc, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        tx.createdAt,
      ]
    );
    await applyRow(txn, toRollupInput(tx));
  });
  bumpDataVersion();
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
         date = ?, date_ms = ?, month_key = ?, day_key = ?, note = ?, note_lc = ?
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
 * Every transaction, oldest first. Used only by full-ledger export today
 * (see `utils/data-transfer-io.ts`) — `getEachAsync` streams rows from
 * SQLite one at a time rather than materializing the whole result set,
 * though the caller here still collects them into an array pending the
 * Phase 8 streaming rewrite of export/import.
 */
export async function listAllTransactions(db: Db): Promise<Transaction[]> {
  const out: Transaction[] = [];
  for await (const row of db.getEachAsync<TransactionRow>(
    `SELECT ${ROW_COLUMNS} FROM transactions ORDER BY seq ASC`
  )) {
    out.push(rowToTransaction(row));
  }
  return out;
}

/** Newest N transactions, optionally for one account (either leg of a transfer counts). For Home's "recent activity" list. */
export async function getRecentTransactions(db: Db, accountId: string | null, limit = 4): Promise<Transaction[]> {
  if (!accountId) {
    const rows = await db.getAllAsync<TransactionRow>(
      `SELECT ${ROW_COLUMNS} FROM transactions ORDER BY date_ms DESC, seq DESC LIMIT ?`,
      [limit]
    );
    return rows.map(rowToTransaction);
  }
  const rows = await db.getAllAsync<TransactionRow>(
    `SELECT ${ROW_COLUMNS} FROM transactions WHERE account_id = ? OR to_account_id = ?
     ORDER BY date_ms DESC, seq DESC LIMIT ?`,
    [accountId, accountId, limit]
  );
  return rows.map(rowToTransaction);
}
