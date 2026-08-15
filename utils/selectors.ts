import { Account, Budget, Category, FinanceState, Transaction } from '@/types/finance';
import { toMonthKey } from '@/utils/date';

export function getAccountBalance(state: FinanceState, accountId: string): number {
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

export function getTotalBalance(state: FinanceState): number {
  return state.accounts
    .filter(a => !a.archived)
    .reduce((sum, a) => sum + getAccountBalance(state, a.id), 0);
}

export function getTransactionsForMonth(state: FinanceState, monthKey: string): Transaction[] {
  return state.transactions
    .filter(t => toMonthKey(t.date) === monthKey)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getMonthlyTotals(state: FinanceState, monthKey: string): { income: number; expense: number } {
  const txns = getTransactionsForMonth(state, monthKey);
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
  }
  return { income, expense };
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
  const txns = getTransactionsForMonth(state, monthKey).filter(t => t.type === kind);
  const totals = new Map<string, number>();
  for (const t of txns) {
    if (!t.categoryId) continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amount);
  }

  const result: CategorySpend[] = [];
  for (const [categoryId, amount] of totals.entries()) {
    const category = state.categories.find(c => c.id === categoryId);
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
  const spendByCategory = new Map(
    getCategorySpend(state, monthKey, 'expense').map(cs => [cs.category.id, cs.amount])
  );

  return state.budgets.map(budget => {
    const category = state.categories.find(c => c.id === budget.categoryId);
    const spent = spendByCategory.get(budget.categoryId) ?? 0;
    const percent = budget.monthlyLimit > 0 ? Math.min(spent / budget.monthlyLimit, 1) : 0;
    return {
      budget,
      category,
      spent,
      percent,
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

export function groupTransactionsByDay(transactions: Transaction[]): GroupedTransactions[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = new Date(t.date).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return Array.from(groups.entries())
    .map(([date, txns]) => ({
      date: txns[0].date,
      transactions: txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
