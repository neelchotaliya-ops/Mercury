import { Account, Budget, Category, Transaction } from '@/types/finance';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, ACCOUNT_TYPE_META } from '@/constants/categories';
import { generateId } from '@/utils/id';

/**
 * Sample data for "Populate sample data" in Settings — four accounts and
 * roughly two years of realistic recurring transactions, so a fresh install
 * has something to look at.
 *
 * Extracted from what used to be `buildDefaultState()` inside
 * `context/finance-context.tsx`, adapted to build plain records the caller
 * inserts through the normal db/ write path rather than a reducer action.
 */
export interface DemoState {
  accounts: Account[];
  categories: Category[];
  budgets: Budget[];
  transactions: Transaction[];
}

function findCategory(categories: Category[], kind: 'income' | 'expense', nameQuery: string): string {
  const match = categories.find(
    c => c.kind === kind && c.name.toLowerCase().includes(nameQuery.toLowerCase())
  );
  return match?.id ?? categories.find(c => c.kind === kind)!.id;
}

export function buildDemoState(): DemoState {
  const categories: Category[] = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map(c => ({
    ...c,
    id: generateId(),
  }));

  const catSalary = findCategory(categories, 'income', 'salary');
  const catGroceries = findCategory(categories, 'expense', 'grocer');
  const catHousing = findCategory(categories, 'expense', 'hous');
  const catUtilities = findCategory(categories, 'expense', 'util');
  const catTransport = findCategory(categories, 'expense', 'transport');
  const catEntertainment = findCategory(categories, 'expense', 'entertain');

  const now = new Date();
  const todayISO = now.toISOString();

  const bankAccount: Account = {
    id: generateId(), name: 'Main Checking', type: 'bank',
    icon: ACCOUNT_TYPE_META.bank.icon, color: ACCOUNT_TYPE_META.bank.color,
    initialBalance: 3200, createdAt: todayISO,
  };
  const cashAccount: Account = {
    id: generateId(), name: 'Cash Wallet', type: 'cash',
    icon: ACCOUNT_TYPE_META.cash.icon, color: ACCOUNT_TYPE_META.cash.color,
    initialBalance: 420, createdAt: todayISO,
  };
  const cardAccount: Account = {
    id: generateId(), name: 'Rewards Card', type: 'card',
    icon: ACCOUNT_TYPE_META.card.icon, color: ACCOUNT_TYPE_META.card.color,
    initialBalance: -240, createdAt: todayISO,
  };
  const savingsAccount: Account = {
    id: generateId(), name: 'Vault Savings', type: 'wallet',
    icon: ACCOUNT_TYPE_META.wallet.icon, color: '#10B981',
    initialBalance: 8500, createdAt: todayISO,
  };

  const transactions: Transaction[] = [];

  for (let m = 24; m >= 0; m--) {
    const targetDate = new Date(now.getFullYear(), now.getMonth() - m, 1);

    const salaryDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1, 10, 0);
    if (salaryDate <= now) {
      transactions.push({
        id: generateId(), type: 'income', amount: 3200 + (m % 3) * 150,
        accountId: bankAccount.id, categoryId: catSalary, note: 'Monthly Salary Deposit',
        date: salaryDate.toISOString(), createdAt: salaryDate.toISOString(),
      });
    }

    const rentDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1, 12, 0);
    if (rentDate <= now) {
      transactions.push({
        id: generateId(), type: 'expense', amount: 1250,
        accountId: bankAccount.id, categoryId: catHousing, note: 'Monthly Rent Payment',
        date: rentDate.toISOString(), createdAt: rentDate.toISOString(),
      });
    }

    const utilDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 5, 14, 30);
    if (utilDate <= now) {
      transactions.push({
        id: generateId(), type: 'expense', amount: 85 + (m % 5) * 12,
        accountId: bankAccount.id, categoryId: catUtilities, note: 'Power & High-Speed Internet',
        date: utilDate.toISOString(), createdAt: utilDate.toISOString(),
      });
    }

    const grocDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 8, 16, 20);
    if (grocDate <= now) {
      transactions.push({
        id: generateId(), type: 'expense', amount: 94.5 + (m % 4) * 15,
        accountId: cashAccount.id, categoryId: catGroceries, note: 'Weekly Pantry Restock',
        date: grocDate.toISOString(), createdAt: grocDate.toISOString(),
      });
    }

    const transportDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 14, 9, 0);
    if (transportDate <= now) {
      transactions.push({
        id: generateId(), type: 'expense', amount: 45 + (m % 3) * 8,
        accountId: cardAccount.id, categoryId: catTransport, note: 'Gas Refill & Transit',
        date: transportDate.toISOString(), createdAt: transportDate.toISOString(),
      });
    }

    const funDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 21, 20, 0);
    if (funDate <= now && m % 2 === 0) {
      transactions.push({
        id: generateId(), type: 'expense', amount: 20 + (m % 4) * 5,
        accountId: cardAccount.id, categoryId: catEntertainment, note: 'Cinema & Streaming',
        date: funDate.toISOString(), createdAt: funDate.toISOString(),
      });
    }
  }

  const budgets: Budget[] = [
    { id: generateId(), categoryId: catGroceries, monthlyLimit: 500, createdAt: todayISO },
    { id: generateId(), categoryId: catHousing, monthlyLimit: 1300, createdAt: todayISO },
    { id: generateId(), categoryId: catUtilities, monthlyLimit: 200, createdAt: todayISO },
    { id: generateId(), categoryId: catEntertainment, monthlyLimit: 150, createdAt: todayISO },
  ];

  return {
    accounts: [bankAccount, cashAccount, cardAccount, savingsAccount],
    categories,
    budgets,
    transactions,
  };
}
