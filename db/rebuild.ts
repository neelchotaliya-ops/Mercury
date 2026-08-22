import { Db } from './types';

/**
 * Recomputes `rollup`, `account_balance` and `ledger_stat` from scratch by
 * scanning `transactions` and `accounts`.
 *
 * Used by the blob migration (cheaper than one delta-apply per historical
 * row), and as a repair path if the incrementally-maintained aggregates are
 * ever suspected to have drifted. Set-based rather than row-by-row: a
 * `GROUP BY` over the whole ledger is roughly two orders of magnitude faster
 * than replaying every transaction's delta individually.
 */
export async function rebuildRollups(db: Db): Promise<void> {
  await db.withTransaction(async txn => {
    await txn.execAsync('DELETE FROM rollup');
    await txn.execAsync('DELETE FROM account_balance');
    // `insertAccount` seeds a zero-delta row for every account so a fresh
    // account with no transactions yet still has a row. Match that here,
    // rather than leaving zero-activity accounts absent and relying on every
    // reader's LEFT JOIN/COALESCE to treat "missing" and "zero" the same way.
    await txn.execAsync('INSERT INTO account_balance (account_id, delta) SELECT id, 0 FROM accounts');
    await txn.execAsync(
      "UPDATE ledger_stat SET n = 0, net = 0 WHERE key IN ('all','income','expense','transfer')"
    );

    for (const [grain, bucketCol] of [
      ['M', 'month_key'],
      ['D', 'day_key'],
    ] as [string, string][]) {
      // Income/expense legs: one row per (bucket, account, category, type).
      await txn.runAsync(
        `INSERT INTO rollup (grain, bucket, account_id, category_id,
                             income, expense, income_count, expense_count)
         SELECT ?, ${bucketCol}, account_id,
                CASE WHEN type = 'transfer' THEN '' ELSE COALESCE(category_id, '') END,
                CAST(ROUND(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END) * 100) AS INTEGER),
                CAST(ROUND(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) * 100) AS INTEGER),
                SUM(CASE WHEN type = 'income'  THEN 1 ELSE 0 END),
                SUM(CASE WHEN type = 'expense' THEN 1 ELSE 0 END)
         FROM transactions
         WHERE type IN ('income','expense')
         GROUP BY 2, 3, 4`,
        [grain]
      );

      // Outgoing transfer legs.
      await txn.runAsync(
        `INSERT INTO rollup (grain, bucket, account_id, category_id, transfer_out, transfer_count)
         SELECT ?, ${bucketCol}, account_id, '',
                CAST(ROUND(SUM(amount) * 100) AS INTEGER), COUNT(*)
         FROM transactions
         WHERE type = 'transfer'
         GROUP BY 2, 3
         ON CONFLICT(grain, bucket, account_id, category_id) DO UPDATE SET
           transfer_out   = transfer_out   + excluded.transfer_out,
           transfer_count = transfer_count + excluded.transfer_count`,
        [grain]
      );

      // Incoming transfer legs.
      await txn.runAsync(
        `INSERT INTO rollup (grain, bucket, account_id, category_id, transfer_in, transfer_count)
         SELECT ?, ${bucketCol}, to_account_id, '',
                CAST(ROUND(SUM(amount) * 100) AS INTEGER), COUNT(*)
         FROM transactions
         WHERE type = 'transfer' AND to_account_id IS NOT NULL
         GROUP BY 2, 3
         ON CONFLICT(grain, bucket, account_id, category_id) DO UPDATE SET
           transfer_in    = transfer_in    + excluded.transfer_in,
           transfer_count = transfer_count + excluded.transfer_count`,
        [grain]
      );
    }

    // Account balances: initial_balance is stored on the account row itself,
    // so this table only ever holds the ledger's contribution to it.
    await txn.runAsync(
      `INSERT INTO account_balance (account_id, delta)
       SELECT account_id, CAST(ROUND(SUM(
         CASE WHEN type = 'income'  THEN amount
              WHEN type = 'expense' THEN -amount
              ELSE -amount END
       ) * 100) AS INTEGER)
       FROM transactions
       GROUP BY account_id
       ON CONFLICT(account_id) DO UPDATE SET delta = delta + excluded.delta`
    );
    await txn.runAsync(
      `INSERT INTO account_balance (account_id, delta)
       SELECT to_account_id, CAST(ROUND(SUM(amount) * 100) AS INTEGER)
       FROM transactions
       WHERE type = 'transfer' AND to_account_id IS NOT NULL
       GROUP BY to_account_id
       ON CONFLICT(account_id) DO UPDATE SET delta = delta + excluded.delta`
    );

    // ledger_stat: 'all' plus one row per type. Transfers count but net 0,
    // matching the Activity header's existing semantics.
    await txn.runAsync(
      `UPDATE ledger_stat SET
         n = (SELECT COUNT(*) FROM transactions),
         net = (SELECT CAST(ROUND(COALESCE(SUM(
           CASE WHEN type = 'income' THEN amount WHEN type = 'expense' THEN -amount ELSE 0 END
         ), 0) * 100) AS INTEGER) FROM transactions)
       WHERE key = 'all'`
    );
    for (const t of ['income', 'expense', 'transfer'] as const) {
      // 'transfer' nets to zero by definition (see rollup-math.ts), so it is
      // set directly rather than through a subquery. A subquery built from a
      // bare literal (`SELECT 0 FROM transactions WHERE type = 'transfer'`)
      // is not wrapped in an aggregate, so when zero transfer rows exist it
      // returns zero *rows* rather than one row of NULL — and the outer
      // scalar-subquery context then evaluates to NULL, which the NOT NULL
      // constraint on ledger_stat.net rejects. income/expense don't have this
      // problem because SUM() always returns exactly one row (NULL when
      // empty), which COALESCE catches.
      if (t === 'transfer') {
        await txn.runAsync(
          `UPDATE ledger_stat SET
             n = (SELECT COUNT(*) FROM transactions WHERE type = 'transfer'),
             net = 0
           WHERE key = 'transfer'`
        );
        continue;
      }
      const net = t === 'income' ? 'SUM(amount)' : '-SUM(amount)';
      await txn.runAsync(
        `UPDATE ledger_stat SET
           n = (SELECT COUNT(*) FROM transactions WHERE type = ?),
           net = (SELECT CAST(ROUND(COALESCE(${net}, 0) * 100) AS INTEGER) FROM transactions WHERE type = ?)
         WHERE key = ?`,
        [t, t, t]
      );
    }
  });
}
