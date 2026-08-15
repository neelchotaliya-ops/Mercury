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
  | { type: 'RESET_ALL_DATA' };

const defaultSettings: AppSettings = {
  currency: 'USD',
  hasOnboarded: false,
};

function buildDefaultCategories(): Category[] {
  return [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map(c => ({
    ...c,
    id: generateId(),
  }));
}

function buildDefaultState(): FinanceState {
  const categories = buildDefaultCategories();
  const cashMeta = ACCOUNT_TYPE_META.cash;
  const defaultAccount: Account = {
    id: generateId(),
    name: 'Cash',
    type: 'cash',
    icon: cashMeta.icon,
    color: cashMeta.color,
    initialBalance: 0,
    createdAt: new Date().toISOString(),
  };

  return {
    accounts: [defaultAccount],
    categories,
    transactions: [],
    budgets: [],
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
}

const FinanceContext = createContext<FinanceContextValue | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const hasHydrated = useRef(false);

  useEffect(() => {
    (async () => {
      const persisted = await loadFinanceState();
      if (persisted && persisted.accounts.length > 0) {
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
