/**
 * The arithmetic behind the pre-aggregated totals.
 *
 * Pure on purpose — no SQL, no expo-sqlite, no React. This is the part of the
 * migration most likely to be subtly wrong, and keeping it a plain function of
 * a transaction row makes it exhaustively testable.
 *
 * The rule that makes it correct: **never compute a diff.** Every mutation is
 * expressed as reverse-the-old then apply-the-new. An edit can move a
 * transaction across month, category and account simultaneously, or change its
 * type from expense to transfer (which adds a second leg) — trying to reason
 * about which fields changed is where hand-rolled aggregate maintenance breaks.
 * Reversing the old contribution in full and applying the new one in full
 * handles every shape with no case analysis, and makes the property test
 * (incremental result must equal a full rebuild) meaningful.
 */

/** Money is stored in the rollup as integer minor units. */
export const MINOR_SCALE = 100;

/**
 * Aggregates are kept in integer minor units even though rows still store a
 * float `amount`, because aggregates are exactly where floating point error
 * accumulates: summing millions of values like 0.1 drifts, and a finance app
 * showing a total that is a few paise off is a bug users notice and cannot
 * explain. Rounding once per row at write time, then summing integers, is
 * exact by construction.
 */
export function toMinor(amount: number): number {
  return Math.round(amount * MINOR_SCALE);
}

export function fromMinor(minor: number): number {
  return minor / MINOR_SCALE;
}

export type Grain = 'M' | 'D';

/** One cell of the rollup table, as a signed delta to be added to it. */
export interface Contribution {
  grain: Grain;
  bucket: string;
  accountId: string;
  /** Empty string rather than null: it is part of the primary key. */
  categoryId: string;
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  incomeCount: number;
  expenseCount: number;
  transferCount: number;
}

export interface BalanceDelta {
  accountId: string;
  delta: number;
}

export interface StatDelta {
  key: 'all' | 'income' | 'expense' | 'transfer';
  n: number;
  net: number;
}

/** The fields of a transaction the aggregates actually depend on. */
export interface RollupInput {
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  monthKey: string;
  dayKey: string;
}

function cell(
  grain: Grain,
  bucket: string,
  accountId: string,
  categoryId: string,
  fields: Partial<Omit<Contribution, 'grain' | 'bucket' | 'accountId' | 'categoryId'>>
): Contribution {
  return {
    grain,
    bucket,
    accountId,
    categoryId,
    income: 0,
    expense: 0,
    transferIn: 0,
    transferOut: 0,
    incomeCount: 0,
    expenseCount: 0,
    transferCount: 0,
    ...fields,
  };
}

/**
 * What one transaction adds to the rollup, at both grains.
 *
 * A transfer emits two cells per grain (one per leg) and carries no category,
 * matching how the app already treats transfers: they move money between
 * accounts without being income or spending.
 */
export function contributionsOf(tx: RollupInput): Contribution[] {
  const minor = toMinor(tx.amount);
  const out: Contribution[] = [];

  for (const [grain, bucket] of [
    ['M', tx.monthKey],
    ['D', tx.dayKey],
  ] as [Grain, string][]) {
    if (tx.type === 'income') {
      out.push(
        cell(grain, bucket, tx.accountId, tx.categoryId ?? '', { income: minor, incomeCount: 1 })
      );
    } else if (tx.type === 'expense') {
      out.push(
        cell(grain, bucket, tx.accountId, tx.categoryId ?? '', { expense: minor, expenseCount: 1 })
      );
    } else {
      out.push(cell(grain, bucket, tx.accountId, '', { transferOut: minor, transferCount: 1 }));
      if (tx.toAccountId) {
        out.push(cell(grain, bucket, tx.toAccountId, '', { transferIn: minor, transferCount: 1 }));
      }
    }
  }

  return out;
}

/** How one transaction moves account balances. */
export function balanceDeltasOf(tx: RollupInput): BalanceDelta[] {
  const minor = toMinor(tx.amount);

  if (tx.type === 'income') return [{ accountId: tx.accountId, delta: minor }];
  if (tx.type === 'expense') return [{ accountId: tx.accountId, delta: -minor }];

  const legs: BalanceDelta[] = [{ accountId: tx.accountId, delta: -minor }];
  if (tx.toAccountId) legs.push({ accountId: tx.toAccountId, delta: minor });
  return legs;
}

/**
 * How one transaction moves the Activity header counters.
 *
 * `net` mirrors what that screen already shows: income adds, expense
 * subtracts, and a transfer is counted but contributes nothing, because it
 * moves money rather than changing the total.
 */
export function statDeltasOf(tx: RollupInput): StatDelta[] {
  const minor = toMinor(tx.amount);
  const net = tx.type === 'income' ? minor : tx.type === 'expense' ? -minor : 0;

  return [
    { key: 'all', n: 1, net },
    { key: tx.type, n: 1, net },
  ];
}

export function negateContributions(items: Contribution[]): Contribution[] {
  return items.map(c => ({
    ...c,
    income: -c.income,
    expense: -c.expense,
    transferIn: -c.transferIn,
    transferOut: -c.transferOut,
    incomeCount: -c.incomeCount,
    expenseCount: -c.expenseCount,
    transferCount: -c.transferCount,
  }));
}

export function negateBalances(items: BalanceDelta[]): BalanceDelta[] {
  return items.map(b => ({ ...b, delta: -b.delta }));
}

export function negateStats(items: StatDelta[]): StatDelta[] {
  return items.map(s => ({ ...s, n: -s.n, net: -s.net }));
}
