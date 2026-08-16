/**
 * Guards the optimized selector layer against the straightforward
 * implementations it replaced. These run on every render of the money screens,
 * so they were rewritten for speed (single-pass balances, string date
 * comparison, cached month keys) — this checks the rewrite did not change a
 * single number, and pins the timezone behaviour that the fast path must keep.
 *
 * Run with: npm run test:selectors
 */

import {
  getAccountBalance,
  getAllAccountBalances,
  getBudgetProgress,
  getCategorySpend,
  getMonthlyTotals,
  getMonthlyTotalsBulk,
  getTotalBalance,
  getTransactionsForMonth,
  groupTransactionsByDay,
} from '../utils/selectors';
import { toMonthKey } from '../utils/date';
import { Account, Budget, Category, FinanceState, Transaction } from '../types/finance';

/** The original O(accounts x transactions) implementation, kept as the oracle. */
function referenceAccountBalance(state: FinanceState, accountId: string): number {
  const account = state.accounts.find(a => a.id === accountId);
  if (!account) return 0;
  let balance = account.initialBalance;
  for (const t of state.transactions) {
    if (t.type === 'income' && t.accountId === accountId) balance += t.amount;
    else if (t.type === 'expense' && t.accountId === accountId) balance -= t.amount;
    else if (t.type === 'transfer') {
      if (t.accountId === accountId) balance -= t.amount;
      if (t.toAccountId === accountId) balance += t.amount;
    }
  }
  return balance;
}

function referenceMonthlyTotals(state: FinanceState, monthKey: string) {
  let income = 0;
  let expense = 0;
  for (const t of state.transactions) {
    if (toMonthKey(t.date) !== monthKey) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense };
}

const account = (id: string, initialBalance: number, archived = false): Account => ({
  id,
  name: `Account ${id}`,
  type: 'bank',
  icon: 'business-outline',
  color: '#3B82F6',
  initialBalance,
  createdAt: '2026-01-01T00:00:00.000Z',
  archived,
});

const category = (id: string, kind: 'expense' | 'income'): Category => ({
  id,
  name: `Cat ${id}`,
  icon: 'cart',
  color: '#5CB98F',
  kind,
});

/** Deterministic pseudo-random ledger, so failures are reproducible. */
function buildLedger(count: number): Transaction[] {
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const out: Transaction[] = [];
  for (let i = 0; i < count; i++) {
    const r = rand();
    const type: Transaction['type'] = r < 0.55 ? 'expense' : r < 0.85 ? 'income' : 'transfer';
    const month = 1 + Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 28);
    const hour = Math.floor(rand() * 24);
    const date = new Date(2026, month - 1, day, hour, 30).toISOString();
    out.push({
      id: `t${i}`,
      type,
      amount: Math.round(rand() * 5000) / 10,
      accountId: rand() < 0.5 ? 'a1' : 'a2',
      toAccountId: type === 'transfer' ? 'a3' : undefined,
      categoryId: type === 'transfer' ? undefined : rand() < 0.5 ? 'c1' : 'c2',
      date,
      createdAt: date,
    });
  }
  return out;
}

const state: FinanceState = {
  accounts: [account('a1', 1000), account('a2', -250.5), account('a3', 9000), account('a4', 77, true)],
  categories: [category('c1', 'expense'), category('c2', 'income')],
  transactions: buildLedger(400),
  budgets: [
    { id: 'b1', categoryId: 'c1', monthlyLimit: 500, createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b2', categoryId: 'missing', monthlyLimit: 100, createdAt: '2026-01-01T00:00:00.000Z' },
  ],
  quickPresets: [],
  settings: { currency: 'INR', hasOnboarded: true },
  isLoaded: true,
};

interface Case {
  name: string;
  run: () => string | null;
}

const eq = (label: string, a: unknown, b: unknown): string | null =>
  a === b ? null : `${label}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`;

const CASES: Case[] = [
  {
    name: 'single-pass balances match the original per-account implementation',
    run: () => {
      const bulk = getAllAccountBalances(state);
      for (const acc of state.accounts) {
        const fail = eq(`balance[${acc.id}]`, bulk.get(acc.id), referenceAccountBalance(state, acc.id));
        if (fail) return fail;
      }
      return null;
    },
  },
  {
    name: 'getAccountBalance still matches the original',
    run: () => {
      for (const acc of state.accounts) {
        const fail = eq(
          `balance[${acc.id}]`,
          getAccountBalance(state, acc.id),
          referenceAccountBalance(state, acc.id)
        );
        if (fail) return fail;
      }
      return null;
    },
  },
  {
    name: 'total balance excludes archived accounts',
    run: () => {
      const expected = state.accounts
        .filter(a => !a.archived)
        .reduce((sum, a) => sum + referenceAccountBalance(state, a.id), 0);
      return eq('total', getTotalBalance(state), expected);
    },
  },
  {
    name: 'monthly totals match the original for every month present',
    run: () => {
      const months = new Set(state.transactions.map(t => toMonthKey(t.date)));
      for (const key of months) {
        const fast = getMonthlyTotals(state, key);
        const slow = referenceMonthlyTotals(state, key);
        const fail =
          eq(`income[${key}]`, fast.income, slow.income) ?? eq(`expense[${key}]`, fast.expense, slow.expense);
        if (fail) return fail;
      }
      return null;
    },
  },
  {
    name: 'bulk monthly totals agree with the single-month path',
    run: () => {
      const keys = ['2026-01', '2026-05', '2026-11'];
      const bulk = getMonthlyTotalsBulk(state, keys);
      for (const key of keys) {
        const single = getMonthlyTotals(state, key);
        const fail =
          eq(`income[${key}]`, bulk.get(key)?.income, single.income) ??
          eq(`expense[${key}]`, bulk.get(key)?.expense, single.expense);
        if (fail) return fail;
      }
      return null;
    },
  },
  {
    name: 'month transactions come back newest-first',
    run: () => {
      const txns = getTransactionsForMonth(state, '2026-05');
      for (let i = 1; i < txns.length; i++) {
        if (txns[i - 1].date < txns[i].date) return `out of order at index ${i}`;
      }
      return txns.length > 0 ? null : 'expected some transactions in 2026-05';
    },
  },
  {
    name: 'month filter uses local time, not the raw UTC string',
    run: () => {
      // 30 min past local midnight on the 1st: east of UTC this timestamp's
      // ISO string still carries the previous month.
      const localFirst = new Date(2026, 5, 1, 0, 30).toISOString();
      const tzState: FinanceState = {
        ...state,
        transactions: [
          {
            id: 'tz',
            type: 'expense',
            amount: 10,
            accountId: 'a1',
            categoryId: 'c1',
            date: localFirst,
            createdAt: localFirst,
          },
        ],
      };
      return eq('june total', getMonthlyTotals(tzState, '2026-06').expense, 10);
    },
  },
  {
    name: 'category spend totals and ordering are correct',
    run: () => {
      const spend = getCategorySpend(state, '2026-05', 'expense');
      let expected = 0;
      for (const t of state.transactions) {
        if (t.type === 'expense' && t.categoryId === 'c1' && toMonthKey(t.date) === '2026-05') {
          expected += t.amount;
        }
      }
      const c1 = spend.find(s => s.category.id === 'c1');
      const fail = eq('c1 spend', c1 ? Math.round(c1.amount * 100) / 100 : 0, Math.round(expected * 100) / 100);
      if (fail) return fail;
      for (let i = 1; i < spend.length; i++) {
        if (spend[i - 1].amount < spend[i].amount) return 'category spend not sorted desc';
      }
      return null;
    },
  },
  {
    name: 'budget progress tolerates a category that no longer exists',
    run: () => {
      const progress = getBudgetProgress(state, '2026-05');
      const orphan = progress.find(p => p.budget.id === 'b2');
      return eq('orphan category', orphan?.category, undefined) ?? eq('orphan spent', orphan?.spent, 0);
    },
  },
  {
    name: 'day grouping keeps every transaction and stays newest-first',
    run: () => {
      const txns = getTransactionsForMonth(state, '2026-05');
      const groups = groupTransactionsByDay(txns);
      const total = groups.reduce((n, g) => n + g.transactions.length, 0);
      const fail = eq('transaction count preserved', total, txns.length);
      if (fail) return fail;
      for (let i = 1; i < groups.length; i++) {
        if (groups[i - 1].date < groups[i].date) return `groups out of order at ${i}`;
      }
      // Each group must be a single calendar day.
      for (const g of groups) {
        const days = new Set(g.transactions.map(t => new Date(t.date).toDateString()));
        if (days.size !== 1) return `group spans ${days.size} days`;
      }
      return null;
    },
  },
  {
    name: 'day grouping also handles unsorted input',
    run: () => {
      const shuffled = [...state.transactions].reverse();
      const groups = groupTransactionsByDay(shuffled);
      const total = groups.reduce((n, g) => n + g.transactions.length, 0);
      const fail = eq('count preserved', total, shuffled.length);
      if (fail) return fail;
      for (let i = 1; i < groups.length; i++) {
        if (groups[i - 1].date < groups[i].date) return `groups out of order at ${i}`;
      }
      return null;
    },
  },
];

let failures = 0;
for (const c of CASES) {
  const failure = c.run();
  if (failure) {
    failures += 1;
    console.log(`FAIL  ${c.name}\n        ${failure}`);
  } else {
    console.log(`ok    ${c.name}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${CASES.length} selector cases passed.`);
