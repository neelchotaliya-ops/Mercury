import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import {
  Account,
  AppSettings,
  Budget,
  Category,
  FinanceState,
  QuickPreset,
  Transaction,
} from '@/types/finance';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, ACCOUNT_TYPE_META } from '@/constants/categories';
import { generateId } from '@/utils/id';
import { loadFinanceState, saveFinanceState, PersistedFinanceState } from '@/storage/storage';
import { refreshWidgets } from '@/utils/widget-bridge';

type Action =
  | { type: 'HYDRATE'; payload: PersistedFinanceState }
  | { type: 'REFRESH_FROM_STORAGE'; payload: PersistedFinanceState }
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
  | { type: 'ADD_PRESET'; payload: QuickPreset }
  | { type: 'UPDATE_PRESET'; payload: QuickPreset }
  | { type: 'DELETE_PRESET'; payload: { id: string } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'REPLACE_ALL_DATA'; payload: PersistedFinanceState }
  | { type: 'RESET_ALL_DATA' }
  | { type: 'SEED_DEMO_DATA' };

const defaultSettings: AppSettings = {
  currency: 'USD',
  hasOnboarded: true,
};

/** Starting points for the home screen widget, all editable in Settings. */
const PRESET_SEEDS: { label: string; emoji: string; amount: number; category: string }[] = [
  { label: 'Coffee', emoji: '☕', amount: 50, category: 'Food & Dining' },
  { label: 'Commute', emoji: '🚌', amount: 30, category: 'Transport' },
  { label: 'Groceries', emoji: '🛒', amount: 500, category: 'Groceries' },
  { label: 'Snacks', emoji: '🍫', amount: 100, category: 'Food & Dining' },
];

/**
 * Seeds presets against whichever default categories the user actually has, so
 * a fresh install and an upgrade both land on a usable widget.
 */
function buildDefaultPresets(categories: Category[]): QuickPreset[] {
  return PRESET_SEEDS.map(seed => ({
    id: generateId(),
    label: seed.label,
    emoji: seed.emoji,
    amount: seed.amount,
    type: 'expense' as const,
    categoryId: categories.find(c => c.kind === 'expense' && c.name === seed.category)?.id,
  }));
}

function buildDefaultCategories(): Category[] {
  return [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map(c => ({
    ...c,
    id: generateId(),
  }));
}

function buildFreshInstallState(): PersistedFinanceState {
  const categories = buildDefaultCategories();
  return {
    accounts: [],
    categories,
    transactions: [],
    budgets: [],
    quickPresets: buildDefaultPresets(categories),
    settings: defaultSettings,
  };
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
    quickPresets: buildDefaultPresets(categories),
    transactions,
    budgets: dummyBudgets,
    settings: defaultSettings,
    isLoaded: true,
  };
}

const initialState: FinanceState = {
  accounts: [],
  categories: [],
  quickPresets: [],
  transactions: [],
  budgets: [],
  settings: defaultSettings,
  isLoaded: false,
};

/**
 * Comparator: newest-first (ISO-8601 strings sort lexicographically).
 * Keeps state.transactions sorted so consumers never need to sort.
 */
function cmpDateDesc(a: Transaction, b: Transaction): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

/**
 * Binary-insert a single transaction into an already-sorted (newest-first)
 * array. O(log n) search + O(n) splice — far cheaper than a full re-sort
 * after every ADD_TRANSACTION action.
 */
function insertSortedDesc(transactions: Transaction[], tx: Transaction): Transaction[] {
  const target = tx.date;
  let lo = 0;
  let hi = transactions.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    // If this slot is older-or-equal to target, the new entry belongs here.
    if (transactions[mid].date <= target) hi = mid;
    else lo = mid + 1;
  }
  const result = [...transactions];
  result.splice(lo, 0, tx);
  return result;
}

function reducer(state: FinanceState, action: Action): FinanceState {
  switch (action.type) {
    case 'HYDRATE':
    case 'REFRESH_FROM_STORAGE':
      return {
        ...action.payload,
        settings: { ...defaultSettings, ...action.payload.settings },
        // Saved before quick presets existed; seed them from the categories
        // this user already has rather than leaving the widget empty.
        quickPresets: action.payload.quickPresets ?? buildDefaultPresets(action.payload.categories),
        // Sort on load — data from older builds may not be sorted yet, and
        // keeping a single guaranteed ordering lets every consumer skip the
        // O(n log n) sort step on every render.
        transactions: [...action.payload.transactions].sort(cmpDateDesc),
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
      // Binary-insert preserves newest-first order without a full sort.
      return { ...state, transactions: insertSortedDesc(state.transactions, action.payload) };
    case 'UPDATE_TRANSACTION': {
      // The transaction's date may have changed, so remove-then-reinsert
      // rather than a map() to keep the array sorted.
      const without = state.transactions.filter(t => t.id !== action.payload.id);
      return { ...state, transactions: insertSortedDesc(without, action.payload) };
    }
    case 'DELETE_TRANSACTION':
      return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload.id) };

    case 'ADD_BUDGET':
      return { ...state, budgets: [...state.budgets, action.payload] };
    case 'UPDATE_BUDGET':
      return { ...state, budgets: state.budgets.map(b => (b.id === action.payload.id ? action.payload : b)) };
    case 'DELETE_BUDGET':
      return { ...state, budgets: state.budgets.filter(b => b.id !== action.payload.id) };

    case 'ADD_PRESET':
      return { ...state, quickPresets: [...state.quickPresets, action.payload] };
    case 'UPDATE_PRESET':
      return {
        ...state,
        quickPresets: state.quickPresets.map(p => (p.id === action.payload.id ? action.payload : p)),
      };
    case 'DELETE_PRESET':
      return {
        ...state,
        quickPresets: state.quickPresets.filter(p => p.id !== action.payload.id),
      };

    case 'UPDATE_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    // Wholesale swap, used by data import. Goes through the same normalisation
    // as HYDRATE so an older export without newer fields still lands valid.
    case 'REPLACE_ALL_DATA':
      return {
        ...action.payload,
        settings: { ...defaultSettings, ...action.payload.settings },
        quickPresets: action.payload.quickPresets ?? buildDefaultPresets(action.payload.categories),
        transactions: [...action.payload.transactions].sort(cmpDateDesc),
        isLoaded: true,
      };

    case 'RESET_ALL_DATA': {
      const categories = buildDefaultCategories();
      return {
        accounts: [],
        categories,
        transactions: [],
        budgets: [],
        quickPresets: buildDefaultPresets(categories),
        settings: defaultSettings,
        isLoaded: true,
      };
    }

    case 'SEED_DEMO_DATA': {
      const seeded = buildDefaultState();
      return { ...seeded, transactions: [...seeded.transactions].sort(cmpDateDesc) };
    }

    default:
      return state;
  }
}

interface FinanceActions {
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
  addPreset: (input: Omit<QuickPreset, 'id'>) => QuickPreset;
  updatePreset: (preset: QuickPreset) => void;
  deletePreset: (id: string) => void;
  replaceAllData: (next: PersistedFinanceState) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  completeOnboarding: () => void;
  resetAllData: () => void;
  seedDemoData: () => void;
}

interface FinanceContextValue extends FinanceActions {
  state: FinanceState;
  /**
   * Set when the last attempted save failed. Non-null means the in-memory
   * ledger is ahead of what is on disk and will be lost if the process dies —
   * screens surface this rather than letting it pass unnoticed.
   */
  persistError: string | null;
}

const FinanceContext = createContext<FinanceContextValue | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [persistError, setPersistError] = useState<string | null>(null);
  const hasHydrated = useRef(false);
  // Set right before a REFRESH_FROM_STORAGE dispatch so the persist effect
  // below doesn't write straight back out the bytes it just read in.
  const skipNextPersist = useRef(false);
  // Debounce handle — prevents a JSON.stringify + AsyncStorage write on every
  // single state change. Rapid interactions (filter taps, navigation) previously
  // stacked multiple synchronous disk writes on the JS thread.
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const persisted = await loadFinanceState();
      if (persisted) {
        dispatch({ type: 'HYDRATE', payload: persisted });
      } else {
        const fresh = buildFreshInstallState();
        dispatch({ type: 'HYDRATE', payload: fresh });
      }
      hasHydrated.current = true;
    })();
  }, []);

  // The widget's headless task writes transactions straight to AsyncStorage,
  // bypassing this reducer entirely, so returning to the app after using it
  // must re-read storage — otherwise the in-memory state stays stale until a
  // full app restart. minimize-and-reopen (not a kill) is exactly the "active"
  // transition below; without this the amount silently disagrees with the
  // widget until the process is killed and relaunched.
  useEffect(() => {
    const onChange = async (next: AppStateStatus) => {
      if (next !== 'active' || !hasHydrated.current) return;
      const fresh = await loadFinanceState();
      if (!fresh) return;
      skipNextPersist.current = true;
      dispatch({ type: 'REFRESH_FROM_STORAGE', payload: fresh });
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!state.isLoaded || !hasHydrated.current) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    // Debounce: only write after the state has been stable for 500 ms.
    // This collapses rapid consecutive changes (typing, filter toggles) into a
    // single disk write instead of one per keystroke.
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      const { isLoaded, ...persistable } = state;
      saveFinanceState(persistable)
        .then(() => {
          setPersistError(null);
          // Home screen widgets read the same store, so keep them in step with it.
          refreshWidgets();
        })
        .catch((e: unknown) => {
          // A failed write means everything entered since the last successful
          // one exists only in memory and dies with the process. The user has
          // to be told while they can still act on it (export a backup), so
          // this is surfaced in the UI rather than logged and forgotten.
          setPersistError(e instanceof Error ? e.message : 'Could not save your data.');
        });
    }, 500);
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    };
  }, [state]);

  /**
   * Actions depend only on `dispatch`, which useReducer guarantees is stable,
   * so this object is built once for the lifetime of the provider. Previously
   * it was rebuilt on every render, which changed the context value's identity
   * on every state change and re-rendered every consumer — including screens
   * that only ever dispatch and never read state.
   */
  const actions = useMemo<FinanceActions>(
    () => ({
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
        const transaction: Transaction = {
          ...input,
          id: generateId(),
          createdAt: new Date().toISOString(),
        };
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

      addPreset: input => {
        const preset: QuickPreset = { ...input, id: generateId() };
        dispatch({ type: 'ADD_PRESET', payload: preset });
        return preset;
      },
      updatePreset: preset => dispatch({ type: 'UPDATE_PRESET', payload: preset }),
      deletePreset: id => dispatch({ type: 'DELETE_PRESET', payload: { id } }),

      replaceAllData: next => dispatch({ type: 'REPLACE_ALL_DATA', payload: next }),
      updateSettings: settings => dispatch({ type: 'UPDATE_SETTINGS', payload: settings }),
      completeOnboarding: () => dispatch({ type: 'UPDATE_SETTINGS', payload: { hasOnboarded: true } }),
      resetAllData: () => dispatch({ type: 'RESET_ALL_DATA' }),
      seedDemoData: () => dispatch({ type: 'SEED_DEMO_DATA' }),
    }),
    []
  );

  const value = useMemo<FinanceContextValue>(
    () => ({ state, persistError, ...actions }),
    [state, persistError, actions]
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};

export const useFinance = (): FinanceContextValue => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
};
