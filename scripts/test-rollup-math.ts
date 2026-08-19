/**
 * The pure aggregate arithmetic.
 *
 * These are cheap unit tests of `db/rollup-math.ts`; the harder property test
 * (incremental maintenance must equal a full rebuild, over a long random
 * mutation sequence) lives in the SQL-level rollup test, since it needs a
 * database to rebuild against.
 */
import {
  RollupInput,
  contributionsOf,
  balanceDeltasOf,
  statDeltasOf,
  negateContributions,
  negateBalances,
  negateStats,
  toMinor,
  fromMinor,
} from '../db/rollup-math';
import { Case, eq, runCases } from './support/harness';

const expense: RollupInput = {
  type: 'expense',
  amount: 250.5,
  accountId: 'a1',
  categoryId: 'c1',
  monthKey: '2026-08',
  dayKey: '2026-08-05',
};

const income: RollupInput = {
  type: 'income',
  amount: 3000,
  accountId: 'a1',
  categoryId: 'c2',
  monthKey: '2026-08',
  dayKey: '2026-08-01',
};

const transfer: RollupInput = {
  type: 'transfer',
  amount: 300,
  accountId: 'a1',
  toAccountId: 'a2',
  monthKey: '2026-08',
  dayKey: '2026-08-09',
};

/** Sums a contribution list the way the SQL upsert would. */
function fold(items: ReturnType<typeof contributionsOf>) {
  const map = new Map<string, Record<string, number>>();
  for (const c of items) {
    const key = `${c.grain}|${c.bucket}|${c.accountId}|${c.categoryId}`;
    const cur = map.get(key) ?? {
      income: 0,
      expense: 0,
      transferIn: 0,
      transferOut: 0,
      incomeCount: 0,
      expenseCount: 0,
      transferCount: 0,
    };
    cur.income += c.income;
    cur.expense += c.expense;
    cur.transferIn += c.transferIn;
    cur.transferOut += c.transferOut;
    cur.incomeCount += c.incomeCount;
    cur.expenseCount += c.expenseCount;
    cur.transferCount += c.transferCount;
    map.set(key, cur);
  }
  return map;
}

const CASES: Case[] = [
  {
    name: 'money converts to integer minor units exactly',
    run: () =>
      eq('250.50', toMinor(250.5), 25050) ??
      eq('0.1', toMinor(0.1), 10) ??
      eq('round-trip', fromMinor(toMinor(250.5)), 250.5) ??
      // The reason this exists at all: 0.1 + 0.2 !== 0.3 in floating point,
      // but the integer equivalent is exact.
      eq('0.1 + 0.2 in minor units', toMinor(0.1) + toMinor(0.2), toMinor(0.3)),
  },
  {
    name: 'an expense contributes to both grains, one cell each',
    run: () => {
      const cells = contributionsOf(expense);
      const month = cells.find(c => c.grain === 'M');
      const day = cells.find(c => c.grain === 'D');
      return (
        eq('cell count', cells.length, 2) ??
        eq('month bucket', month?.bucket, '2026-08') ??
        eq('day bucket', day?.bucket, '2026-08-05') ??
        eq('month expense', month?.expense, 25050) ??
        eq('month count', month?.expenseCount, 1) ??
        eq('income untouched', month?.income, 0)
      );
    },
  },
  {
    name: 'a transfer emits both legs per grain and carries no category',
    run: () => {
      const cells = contributionsOf(transfer);
      const out = cells.find(c => c.grain === 'M' && c.accountId === 'a1');
      const into = cells.find(c => c.grain === 'M' && c.accountId === 'a2');
      return (
        eq('cell count', cells.length, 4) ??
        eq('source out', out?.transferOut, 30000) ??
        eq('destination in', into?.transferIn, 30000) ??
        eq('source category', out?.categoryId, '') ??
        eq('destination category', into?.categoryId, '')
      );
    },
  },
  {
    name: 'a transfer with no destination only emits the outgoing leg',
    run: () => {
      const cells = contributionsOf({ ...transfer, toAccountId: null });
      return eq('cell count', cells.length, 2) ?? eq('out', cells[0].transferOut, 30000);
    },
  },
  {
    name: 'an uncategorised transaction buckets under the empty category key',
    run: () => {
      // '' rather than null because category_id is part of the rollup's
      // primary key, and NULL never compares equal to NULL in a key.
      const cells = contributionsOf({ ...expense, categoryId: null });
      return eq('category', cells[0].categoryId, '');
    },
  },
  {
    name: 'balances move the right way for each type',
    run: () => {
      const inc = balanceDeltasOf(income);
      const exp = balanceDeltasOf(expense);
      const tr = balanceDeltasOf(transfer);
      return (
        eq('income delta', inc[0].delta, 300000) ??
        eq('expense delta', exp[0].delta, -25050) ??
        eq('transfer legs', tr.length, 2) ??
        eq('transfer out', tr[0].delta, -30000) ??
        eq('transfer in', tr[1].delta, 30000) ??
        eq('transfer nets to zero', tr[0].delta + tr[1].delta, 0)
      );
    },
  },
  {
    name: 'header stats count every transaction but transfers add nothing to net',
    run: () => {
      const inc = statDeltasOf(income);
      const tr = statDeltasOf(transfer);
      return (
        eq('income all-net', inc.find(s => s.key === 'all')?.net, 300000) ??
        eq('income counted', inc.find(s => s.key === 'income')?.n, 1) ??
        eq('transfer counted', tr.find(s => s.key === 'all')?.n, 1) ??
        eq('transfer net', tr.find(s => s.key === 'all')?.net, 0)
      );
    },
  },
  {
    name: 'applying then reversing a transaction leaves nothing behind',
    run: () => {
      // This is the invariant the whole edit path depends on.
      const folded = fold([...contributionsOf(transfer), ...negateContributions(contributionsOf(transfer))]);
      for (const [key, cell] of folded) {
        for (const [field, value] of Object.entries(cell)) {
          if (value !== 0) return `${key}.${field} left ${value}, expected 0`;
        }
      }
      const bal = [...balanceDeltasOf(income), ...negateBalances(balanceDeltasOf(income))];
      const stats = [...statDeltasOf(expense), ...negateStats(statDeltasOf(expense))];
      return (
        eq('balance residue', bal.reduce((s, b) => s + b.delta, 0), 0) ??
        eq('stat n residue', stats.reduce((s, x) => s + x.n, 0), 0) ??
        eq('stat net residue', stats.reduce((s, x) => s + x.net, 0), 0)
      );
    },
  },
  {
    name: 'an edit across month, category and account reverses cleanly',
    run: () => {
      // The case hand-rolled aggregate maintenance usually gets wrong: reverse
      // the old contribution in full, apply the new one in full, and no stale
      // cell survives in the bucket the transaction moved out of.
      const before: RollupInput = expense;
      const after: RollupInput = {
        ...expense,
        amount: 99,
        accountId: 'a2',
        categoryId: 'c9',
        monthKey: '2026-09',
        dayKey: '2026-09-02',
      };

      const folded = fold([
        ...contributionsOf(before),
        ...negateContributions(contributionsOf(before)),
        ...contributionsOf(after),
      ]);

      const oldMonth = folded.get('M|2026-08|a1|c1');
      const newMonth = folded.get('M|2026-09|a2|c9');
      return (
        eq('old bucket emptied', oldMonth?.expense, 0) ??
        eq('old bucket count', oldMonth?.expenseCount, 0) ??
        eq('new bucket amount', newMonth?.expense, 9900) ??
        eq('new bucket count', newMonth?.expenseCount, 1)
      );
    },
  },
  {
    name: 'changing an expense into a transfer drops the category cell and adds a leg',
    run: () => {
      const before: RollupInput = expense;
      const after: RollupInput = { ...expense, type: 'transfer', toAccountId: 'a2', categoryId: null };
      const folded = fold([
        ...contributionsOf(before),
        ...negateContributions(contributionsOf(before)),
        ...contributionsOf(after),
      ]);
      const oldCell = folded.get('M|2026-08|a1|c1');
      const legOut = folded.get('M|2026-08|a1|');
      const legIn = folded.get('M|2026-08|a2|');
      return (
        eq('old category cell emptied', oldCell?.expense, 0) ??
        eq('outgoing leg', legOut?.transferOut, 25050) ??
        eq('incoming leg', legIn?.transferIn, 25050)
      );
    },
  },
];

runCases(CASES, 'rollup math cases');
