import { Db } from './types';
import {
  Contribution,
  BalanceDelta,
  StatDelta,
  RollupInput,
  contributionsOf,
  balanceDeltasOf,
  statDeltasOf,
  negateContributions,
  negateBalances,
  negateStats,
} from './rollup-math';

/**
 * Applies the pre-aggregated tables' side of a write.
 *
 * These are the only functions that touch `rollup`, `account_balance` and
 * `ledger_stat`. Every caller (insert, update, delete, the blob migration, the
 * widget) goes through here, so there is exactly one place that can get the
 * upsert SQL wrong.
 */

const UPSERT_ROLLUP = `
  INSERT INTO rollup (grain, bucket, account_id, category_id,
                      income, expense, transfer_in, transfer_out,
                      income_count, expense_count, transfer_count)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(grain, bucket, account_id, category_id) DO UPDATE SET
    income         = income         + excluded.income,
    expense        = expense        + excluded.expense,
    transfer_in    = transfer_in    + excluded.transfer_in,
    transfer_out   = transfer_out   + excluded.transfer_out,
    income_count   = income_count   + excluded.income_count,
    expense_count  = expense_count  + excluded.expense_count,
    transfer_count = transfer_count + excluded.transfer_count
`;

/** Bucket cells that reversed back to nothing don't linger forever. */
const GC_EMPTY_ROLLUP = `
  DELETE FROM rollup
  WHERE grain = ? AND bucket = ? AND account_id = ? AND category_id = ?
    AND income = 0 AND expense = 0 AND transfer_in = 0 AND transfer_out = 0
    AND income_count = 0 AND expense_count = 0 AND transfer_count = 0
`;

export async function applyContributions(db: Db, items: Contribution[]): Promise<void> {
  for (const c of items) {
    await db.runAsync(UPSERT_ROLLUP, [
      c.grain,
      c.bucket,
      c.accountId,
      c.categoryId,
      c.income,
      c.expense,
      c.transferIn,
      c.transferOut,
      c.incomeCount,
      c.expenseCount,
      c.transferCount,
    ]);
    await db.runAsync(GC_EMPTY_ROLLUP, [c.grain, c.bucket, c.accountId, c.categoryId]);
  }
}

export async function applyBalances(db: Db, items: BalanceDelta[]): Promise<void> {
  for (const b of items) {
    await db.runAsync(
      `INSERT INTO account_balance (account_id, delta) VALUES (?, ?)
       ON CONFLICT(account_id) DO UPDATE SET delta = delta + excluded.delta`,
      [b.accountId, b.delta]
    );
  }
}

export async function applyStats(db: Db, items: StatDelta[]): Promise<void> {
  for (const s of items) {
    await db.runAsync('UPDATE ledger_stat SET n = n + ?, net = net + ? WHERE key = ?', [
      s.n,
      s.net,
      s.key,
    ]);
  }
}

/** Applies every aggregate side-effect of one transaction appearing. */
export async function applyRow(db: Db, row: RollupInput): Promise<void> {
  await applyContributions(db, contributionsOf(row));
  await applyBalances(db, balanceDeltasOf(row));
  await applyStats(db, statDeltasOf(row));
}

/** Reverses every aggregate side-effect of one transaction disappearing. */
export async function reverseRow(db: Db, row: RollupInput): Promise<void> {
  await applyContributions(db, negateContributions(contributionsOf(row)));
  await applyBalances(db, negateBalances(balanceDeltasOf(row)));
  await applyStats(db, negateStats(statDeltasOf(row)));
}
