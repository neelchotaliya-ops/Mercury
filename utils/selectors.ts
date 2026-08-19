import { Account, Budget, Category, FinanceState, Transaction } from '@/types/finance';

/**
 * The parts of the store balance maths actually reads.
 *
 * Narrower than `FinanceState` so callers can memoize on just these two arrays
 * instead of the whole state object, whose identity changes on any mutation.
 */
export type BalanceSlice = Pick<FinanceState, 'accounts' | 'transactions'>;
import { dayKeyOf, monthKeyOf } from '@/utils/date';

/**
 * Derived reads over finance state.
 *
 * These run on every render of the money screens, over a ledger that grows
 * without bound, so the hot paths avoid two things deliberately:
 *
 *  - `new Date(...)` inside sort comparators. Comparators run O(n log n) times
 *    and each `new Date` is a fresh allocation plus a string parse. ISO-8601
 *    timestamps sort correctly as plain strings, so we compare strings.
 *  - Repeated full scans. Balances for every account come from one pass over
 *    the ledger rather than one pass per account.
 */

/** ISO-8601 strings are lexicographically ordered, so no Date parsing needed. */
function compareDateDesc(a: { date: string }, b: { date: string }): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

/**
 * Balances for every account in a single pass over the ledger.
 * Callers that need more than one account should use this rather than calling
 * `getAccountBalance` in a loop, which is O(accounts x transactions).
 */
export function getAllAccountBalances(state: BalanceSlice): Map<string, number> {
  const balances = new Map<string, number>();
  for (const account of state.accounts) {
    balances.set(account.id, account.initialBalance);
  }

  for (const t of state.transactions) {
    if (t.type === 'income') {
      const current = balances.get(t.accountId);
      if (current !== undefined) balances.set(t.accountId, current + t.amount);
    } else if (t.type === 'expense') {
      const current = balances.get(t.accountId);
      if (current !== undefined) balances.set(t.accountId, current - t.amount);
    } else {
      const from = balances.get(t.accountId);
      if (from !== undefined) balances.set(t.accountId, from - t.amount);
      if (t.toAccountId) {
        const to = balances.get(t.toAccountId);
        if (to !== undefined) balances.set(t.toAccountId, to + t.amount);
      }
    }
  }

  return balances;
}

export function getAccountBalance(state: FinanceState, accountId: string): number {
  const account = state.accounts.find(a => a.id === accountId);
  if (!account) return 0;

  let balance = account.initialBalance;
  for (const t of state.transactions) {
    if (t.accountId === accountId) {
      if (t.type === 'income') balance += t.amount;
      else balance -= t.amount;
    } else if (t.type === 'transfer' && t.toAccountId === accountId) {
      balance += t.amount;
    }
  }
  return balance;
}

export function getTotalBalance(state: FinanceState): number {
  const balances = getAllAccountBalances(state);
  let total = 0;
  for (const account of state.accounts) {
    if (!account.archived) total += balances.get(account.id) ?? 0;
  }
  return total;
}

export function getTransactionsForMonth(state: FinanceState, monthKey: string): Transaction[] {
  const out: Transaction[] = [];
  for (const t of state.transactions) {
    if (monthKeyOf(t.date) === monthKey) out.push(t);
  }
  return out.sort(compareDateDesc);
}

export function getMonthlyTotals(
  state: FinanceState,
  monthKey: string
): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  // No intermediate array or sort: totals do not care about order.
  for (const t of state.transactions) {
    if (monthKeyOf(t.date) !== monthKey) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense };
}

/** Totals for many months in one pass, for trend charts. */
export function getMonthlyTotalsBulk(
  state: FinanceState,
  monthKeys: string[]
): Map<string, { income: number; expense: number }> {
  const wanted = new Map<string, { income: number; expense: number }>();
  for (const key of monthKeys) wanted.set(key, { income: 0, expense: 0 });

  for (const t of state.transactions) {
    const bucket = wanted.get(monthKeyOf(t.date));
    if (!bucket) continue;
    if (t.type === 'income') bucket.income += t.amount;
    else if (t.type === 'expense') bucket.expense += t.amount;
  }

  return wanted;
}

export interface CategorySpend {
  category: Category;
  amount: number;
}

export function getCategorySpend(
  state: FinanceState,
  monthKey: string,
  kind: 'income' | 'expense'
): CategorySpend[] {
  const totals = new Map<string, number>();
  for (const t of state.transactions) {
    if (t.type !== kind || !t.categoryId) continue;
    if (monthKeyOf(t.date) !== monthKey) continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount);
  }
  if (totals.size === 0) return [];

  const byId = new Map(state.categories.map(c => [c.id, c]));
  const result: CategorySpend[] = [];
  for (const [categoryId, amount] of totals) {
    const category = byId.get(categoryId);
    if (category) result.push({ category, amount });
  }
  return result.sort((a, b) => b.amount - a.amount);
}

export interface BudgetProgress {
  budget: Budget;
  category: Category | undefined;
  spent: number;
  percent: number;
  remaining: number;
}

export function getBudgetProgress(state: FinanceState, monthKey: string): BudgetProgress[] {
  const spendByCategory = new Map<string, number>();
  for (const t of state.transactions) {
    if (t.type !== 'expense' || !t.categoryId) continue;
    if (monthKeyOf(t.date) !== monthKey) continue;
    spendByCategory.set(t.categoryId, (spendByCategory.get(t.categoryId) ?? 0) + t.amount);
  }

  const byId = new Map(state.categories.map(c => [c.id, c]));

  return state.budgets.map(budget => {
    const spent = spendByCategory.get(budget.categoryId) ?? 0;
    return {
      budget,
      category: byId.get(budget.categoryId),
      spent,
      percent: budget.monthlyLimit > 0 ? Math.min(spent / budget.monthlyLimit, 1) : 0,
      remaining: budget.monthlyLimit - spent,
    };
  });
}

export function getAccountById(state: FinanceState, id: string | undefined): Account | undefined {
  if (!id) return undefined;
  return state.accounts.find(a => a.id === id);
}

export function getCategoryById(state: FinanceState, id: string | undefined): Category | undefined {
  if (!id) return undefined;
  return state.categories.find(c => c.id === id);
}

export interface GroupedTransactions {
  date: string;
  transactions: Transaction[];
}

/**
 * Groups by calendar day. Expects newest-first input and preserves that order,
 * so no per-group re-sorting is needed.
 */
export function groupTransactionsByDay(transactions: Transaction[]): GroupedTransactions[] {
  const sorted =
    isSortedDesc(transactions) ? transactions : [...transactions].sort(compareDateDesc);

  const groups: GroupedTransactions[] = [];
  let currentKey = '';

  for (const t of sorted) {
    const key = dayKeyOf(t.date);
    if (key !== currentKey) {
      groups.push({ date: t.date, transactions: [t] });
      currentKey = key;
    } else {
      groups[groups.length - 1].transactions.push(t);
    }
  }

  return groups;
}

function isSortedDesc(transactions: Transaction[]): boolean {
  for (let i = 1; i < transactions.length; i++) {
    if (transactions[i - 1].date < transactions[i].date) return false;
  }
  return true;
}
