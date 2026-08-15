import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';

import { Account, AppSettings, Budget, Category, FinanceState, Transaction } from '@/types/finance';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, ACCOUNT_TYPE_META } from '@/constants/categories';
import { generateId } from '@/utils/id';
import { loadFinanceState, saveFinanceState, PersistedFinanceState } from '@/storage/storage';

type Action =
  | { type: 'HYDRATE'; payload: PersistedFinanceState }
  | { type: 'ADD_ACCOUNT'; payload: Account }
  | { type: 'UPDATE_ACCOUNT'; payload: Account }
  | { type: 'DELETE_ACCOUNT'; payload: { id: string } }
  | { type: 'ADD_CATEGORY'; payload: Category }
  | { type: 'UPDATE_CATEGORY'; payload: Category }
  | { type: 'DELETE_CATEGORY'; payload: { id: string } }
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: Transaction }
  | { type: 'DELETE_TRANSACTION'; payload: { id: string } }
  | { type: 'ADD_BUDGET'; payload: Budget }
  | { type: 'UPDATE_BUDGET'; payload: Budget }
  | { type: 'DELETE_BUDGET'; payload: { id: string } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'RESET_ALL_DATA' }
  | { type: 'SEED_DEMO_DATA' };

const defaultSettings: AppSettings = {
  currency: 'USD',
  hasOnboarded: true,
};

function buildDefaultCategories(): Category[] {
  return [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map(c => ({
    ...c,
    id: generateId(),
  }));
}

function buildDefaultState(): FinanceState {
  const categories = buildDefaultCategories();

  const getCatId = (nameQuery: string, fallbackKind: 'income' | 'expense') => {
    const match = categories.find(
      c => c.kind === fallbackKind && c.name.toLowerCase().includes(nameQuery.toLowerCase())
    );
    if (match) return match.id;
    const fallback = categories.find(c => c.kind === fallbackKind);
    return fallback ? fallback.id : generateId();
  };

  const catSalary = getCatId('salary', 'income');
  const catFreelance = getCatId('freelance', 'income');

  const catGroceries = getCatId('grocer', 'expense') || getCatId('food', 'expense');
  const catHousing = getCatId('house', 'expense') || getCatId('rent', 'expense');
  const catUtilities = getCatId('util', 'expense') || getCatId('bill', 'expense');
  const catEntertainment = getCatId('entertain', 'expense') || getCatId('fun', 'expense');
  const catShopping = getCatId('shop', 'expense');
  const catTransport = getCatId('transport', 'expense') || getCatId('gas', 'expense');
  const catHealth = getCatId('health', 'expense');

  const now = new Date();
  const todayISO = now.toISOString();

  // Accounts
  const bankAccount: Account = {
    id: generateId(),
    name: 'Main Checking',
    type: 'bank',
    icon: ACCOUNT_TYPE_META.bank.icon,
    color: ACCOUNT_TYPE_META.bank.color,
    initialBalance: 3200,
    createdAt: todayISO,
  };

  const cashAccount: Account = {
    id: generateId(),
    name: 'Cash Wallet',
    type: 'cash',
    icon: ACCOUNT_TYPE_META.cash.icon,
    color: ACCOUNT_TYPE_META.cash.color,
    initialBalance: 420,
    createdAt: todayISO,
  };

  const cardAccount: Account = {
    id: generateId(),
    name: 'Rewards Card',
    type: 'card',
    icon: ACCOUNT_TYPE_META.card.icon,
    color: ACCOUNT_TYPE_META.card.color,
    initialBalance: -240,
    createdAt: todayISO,
  };

  const savingsAccount: Account = {
    id: generateId(),
    name: 'Vault Savings',
    type: 'wallet',
    icon: ACCOUNT_TYPE_META.wallet.icon,
    color: '#10B981',
    initialBalance: 8500,
    createdAt: todayISO,
  };

  const transactions: Transaction[] = [];

  // Generate 24 months of rich realistic data (month 24 down to 0)
  for (let m = 24; m >= 0; m--) {
    const year = now.getFullYear();
    const month = now.getMonth() - m;
    const targetDate = new Date(year, month, 1);

    // 1st of month: Salary Income
    const salaryDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1, 10, 0);
    if (salaryDate <= now) {
      transactions.push({
        id: generateId(),
        type: 'income',
        amount: 3200 + (m % 3) * 150,
        accountId: bankAccount.id,
        categoryId: catSalary,
        note: 'Monthly Salary Deposit',
        date: salaryDate.toISOString(),
        createdAt: salaryDate.toISOString(),
      });
    }

    // 1st of month: Apartment Rent
    const rentDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1, 12, 0);
    if (rentDate <= now) {
      transactions.push({
        id: generateId(),
        type: 'expense',
        amount: 1250,
        accountId: bankAccount.id,
        categoryId: catHousing,
        note: 'Monthly Rent Payment',
        date: rentDate.toISOString(),
        createdAt: rentDate.toISOString(),
      });
    }

    // 5th of month: Electric & Utilities
    const utilDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 5, 14, 30);
    if (utilDate <= now) {
      transactions.push({
        id: generateId(),
        type: 'expense',
        amount: 85 + (m % 5) * 12,
        accountId: bankAccount.id,
        categoryId: catUtilities,
        note: 'Power & High-Speed Internet',
        date: utilDate.toISOString(),
        createdAt: utilDate.toISOString(),
      });
    }

    // 8th of month: Groceries
    const grocDate1 = new Date(targetDate.getFullYear(), targetDate.getMonth(), 8, 16, 20);
    if (grocDate1 <= now) {
      transactions.push({
        id: generateId(),
        type: 'expense',
        amount: 94.50 + (m % 4) * 15,
        accountId: bankAccount.id,
        categoryId: catGroceries,
        note: 'Organic Foods & Essentials',
        date: grocDate1.toISOString(),
        createdAt: grocDate1.toISOString(),
      });
    }

    // 12th of month: Freelance side income (every 2 months)
    if (m % 2 === 0) {
      const freeDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 12, 11, 0);
      if (freeDate <= now) {
        transactions.push({
          id: generateId(),
          type: 'income',
          amount: 450 + (m % 3) * 100,
          accountId: cashAccount.id,
          categoryId: catFreelance,
          note: 'Design Consulting Fee',
          date: freeDate.toISOString(),
          createdAt: freeDate.toISOString(),
        });
      }
    }

    // 15th of month: Mid-month Groceries & Dining
    const grocDate2 = new Date(targetDate.getFullYear(), targetDate.getMonth(), 15, 18, 45);
    if (grocDate2 <= now) {
      transactions.push({
        id: generateId(),
        type: 'expense',
        amount: 68.20 + (m % 3) * 10,
        accountId: cashAccount.id,
        categoryId: catGroceries,
        note: 'Weekly Pantry Restock',
        date: grocDate2.toISOString(),
        createdAt: grocDate2.toISOString(),
      });
    }

    // 18th of month: Entertainment / Streaming
    const entDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 18, 20, 15);
    if (entDate <= now) {
      transactions.push({
        id: generateId(),
        type: 'expense',
        amount: 16.99 + (m % 2) * 5,
        accountId: cardAccount.id,
        categoryId: catEntertainment,
        note: 'Cinema & Streaming Subscriptions',
        date: entDate.toISOString(),
        createdAt: entDate.toISOString(),
      });
    }

    // 22nd of month: Fuel & Transport
    const transDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 22, 9, 10);
    if (transDate <= now) {
      transactions.push({
        id: generateId(),
        type: 'expense',
        amount: 48.00 + (m % 4) * 8,
        accountId: bankAccount.id,
        categoryId: catTransport,
        note: 'Gas Refill & Transit Pass',
        date: transDate.toISOString(),
        createdAt: transDate.toISOString(),
      });
    }

    // 26th of month: Shopping
    const shopDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 26, 15, 30);
    if (shopDate <= now) {
      transactions.push({
        id: generateId(),
        type: 'expense',
        amount: 110.00 + (m % 5) * 25,
        accountId: cardAccount.id,
        categoryId: catShopping,
        note: 'Clothing & Electronics',
        date: shopDate.toISOString(),
        createdAt: shopDate.toISOString(),
      });
    }

    // 28th of month: Health & Gym
    const healthDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 28, 7, 45);
    if (healthDate <= now) {
      transactions.push({
        id: generateId(),
        type: 'expense',
        amount: 45.00,
        accountId: cardAccount.id,
        categoryId: catHealth,
        note: 'Fitness Club Membership',
        date: healthDate.toISOString(),
        createdAt: healthDate.toISOString(),
      });
    }
  }

  // Budgets
  const dummyBudgets: Budget[] = [
    {
      id: generateId(),
      categoryId: catGroceries,
      monthlyLimit: 500,
      createdAt: todayISO,
    },
    {
      id: generateId(),
      categoryId: catEntertainment,
      monthlyLimit: 150,
      createdAt: todayISO,
    },
    {
      id: generateId(),
      categoryId: catShopping,
      monthlyLimit: 300,
      createdAt: todayISO,
    },
    {
      id: generateId(),
      categoryId: catUtilities,
      monthlyLimit: 200,
      createdAt: todayISO,
    },
  ];

  return {
    accounts: [bankAccount, cashAccount, cardAccount, savingsAccount],
    categories,
    transactions,
    budgets: dummyBudgets,
    settings: defaultSettings,
    isLoaded: true,
  };
}

const initialState: FinanceState = {
  accounts: [],
  categories: [],
  transactions: [],
  budgets: [],
  settings: defaultSettings,
  isLoaded: false,
};

function reducer(state: FinanceState, action: Action): FinanceState {
  switch (action.type) {
    case 'HYDRATE':
      return {
        ...action.payload,
        settings: { ...defaultSettings, ...action.payload.settings },
        isLoaded: true,
      };

    case 'ADD_ACCOUNT':
      return { ...state, accounts: [...state.accounts, action.payload] };
    case 'UPDATE_ACCOUNT':
      return {
        ...state,
        accounts: state.accounts.map(a => (a.id === action.payload.id ? action.payload : a)),
      };
    case 'DELETE_ACCOUNT':
      return {
        ...state,
        accounts: state.accounts.filter(a => a.id !== action.payload.id),
        transactions: state.transactions.filter(
          t => t.accountId !== action.payload.id && t.toAccountId !== action.payload.id
        ),
      };

    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload] };
    case 'UPDATE_CATEGORY':
      return {
        ...state,
        categories: state.categories.map(c => (c.id === action.payload.id ? action.payload : c)),
      };
    case 'DELETE_CATEGORY':
      return {
        ...state,
        categories: state.categories.filter(c => c.id !== action.payload.id),
        budgets: state.budgets.filter(b => b.categoryId !== action.payload.id),
      };

    case 'ADD_TRANSACTION':
      return { ...state, transactions: [...state.transactions, action.payload] };
    case 'UPDATE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.map(t => (t.id === action.payload.id ? action.payload : t)),
      };
    case 'DELETE_TRANSACTION':
      return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload.id) };

    case 'ADD_BUDGET':
      return { ...state, budgets: [...state.budgets, action.payload] };
    case 'UPDATE_BUDGET':
      return { ...state, budgets: state.budgets.map(b => (b.id === action.payload.id ? action.payload : b)) };
    case 'DELETE_BUDGET':
      return { ...state, budgets: state.budgets.filter(b => b.id !== action.payload.id) };

    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    case 'RESET_ALL_DATA':
      return {
        accounts: [],
        categories: buildDefaultCategories(),
        transactions: [],
        budgets: [],
        settings: defaultSettings,
        isLoaded: true,
      };

    case 'SEED_DEMO_DATA':
      return buildDefaultState();

    default:
      return state;
  }
}

interface FinanceContextValue {
  state: FinanceState;
  addAccount: (input: Omit<Account, 'id' | 'createdAt'>) => Account;
  updateAccount: (account: Account) => void;
  deleteAccount: (id: string) => void;
  addCategory: (input: Omit<Category, 'id'>) => Category;
  updateCategory: (category: Category) => void;
  deleteCategory: (id: string) => void;
  addTransaction: (input: Omit<Transaction, 'id' | 'createdAt'>) => Transaction;
  updateTransaction: (transaction: Transaction) => void;
  deleteTransaction: (id: string) => void;
  addBudget: (input: Omit<Budget, 'id' | 'createdAt'>) => Budget;
  updateBudget: (budget: Budget) => void;
  deleteBudget: (id: string) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  completeOnboarding: () => void;
  resetAllData: () => void;
  seedDemoData: () => void;
}

const FinanceContext = createContext<FinanceContextValue | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const hasHydrated = useRef(false);

  useEffect(() => {
    (async () => {
      const persisted = await loadFinanceState();
      if (persisted && (persisted.accounts.length > 0 || persisted.transactions.length > 0)) {
        dispatch({ type: 'HYDRATE', payload: persisted });
      } else {
        const seeded = buildDefaultState();
        dispatch({ type: 'HYDRATE', payload: seeded });
      }
      hasHydrated.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!state.isLoaded || !hasHydrated.current) return;
    const { isLoaded, ...persistable } = state;
    saveFinanceState(persistable);
  }, [state]);

  const value: FinanceContextValue = {
    state,
    addAccount: input => {
      const account: Account = { ...input, id: generateId(), createdAt: new Date().toISOString() };
      dispatch({ type: 'ADD_ACCOUNT', payload: account });
      return account;
    },
    updateAccount: account => dispatch({ type: 'UPDATE_ACCOUNT', payload: account }),
    deleteAccount: id => dispatch({ type: 'DELETE_ACCOUNT', payload: { id } }),

    addCategory: input => {
      const category: Category = { ...input, id: generateId() };
      dispatch({ type: 'ADD_CATEGORY', payload: category });
      return category;
    },
    updateCategory: category => dispatch({ type: 'UPDATE_CATEGORY', payload: category }),
    deleteCategory: id => dispatch({ type: 'DELETE_CATEGORY', payload: { id } }),

    addTransaction: input => {
      const transaction: Transaction = { ...input, id: generateId(), createdAt: new Date().toISOString() };
      dispatch({ type: 'ADD_TRANSACTION', payload: transaction });
      return transaction;
    },
    updateTransaction: transaction => dispatch({ type: 'UPDATE_TRANSACTION', payload: transaction }),
    deleteTransaction: id => dispatch({ type: 'DELETE_TRANSACTION', payload: { id } }),

    addBudget: input => {
      const budget: Budget = { ...input, id: generateId(), createdAt: new Date().toISOString() };
      dispatch({ type: 'ADD_BUDGET', payload: budget });
      return budget;
    },
    updateBudget: budget => dispatch({ type: 'UPDATE_BUDGET', payload: budget }),
    deleteBudget: id => dispatch({ type: 'DELETE_BUDGET', payload: { id } }),

    updateSettings: settings => dispatch({ type: 'UPDATE_SETTINGS', payload: settings }),
    completeOnboarding: () => dispatch({ type: 'UPDATE_SETTINGS', payload: { hasOnboarded: true } }),
    resetAllData: () => dispatch({ type: 'RESET_ALL_DATA' }),
    seedDemoData: () => dispatch({ type: 'SEED_DEMO_DATA' }),
  };

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};

export const useFinance = (): FinanceContextValue => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
};
