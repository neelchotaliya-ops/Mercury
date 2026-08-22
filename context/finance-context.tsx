import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';

import {
  Account,
  AppSettings,
  Budget,
  Category,
  QuickPreset,
  Transaction,
} from '@/types/finance';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, ACCOUNT_TYPE_META } from '@/constants/categories';
import { generateId } from '@/utils/id';
import { getDb, getBlobMigrationResult } from '@/db/client';
import { bumpDataVersion, getDataVersion, subscribeDataVersion } from '@/db/version';
import {
  listAccounts,
  listCategories,
  listBudgets,
  listPresets,
  getSettings,
  insertAccount,
  updateAccount as dbUpdateAccount,
  deleteAccount as dbDeleteAccount,
  insertCategory,
  updateCategory as dbUpdateCategory,
  deleteCategory as dbDeleteCategory,
  insertBudget,
  updateBudget as dbUpdateBudget,
  deleteBudget as dbDeleteBudget,
  insertPreset,
  updatePreset as dbUpdatePreset,
  deletePreset as dbDeletePreset,
  updateSettings as dbUpdateSettings,
} from '@/db/entities';
import {
  insertTransaction,
  updateTransaction as dbUpdateTransaction,
  deleteTransaction as dbDeleteTransaction,
} from '@/db/transactions';

/**
 * The small, bounded entities: accounts, categories, budgets, presets,
 * settings. There are tens of rows here, never millions, so they stay fully
 * loaded in React state the same way they always have.
 *
 * `transactions` is deliberately absent — that was the whole point of this
 * rewrite. It used to live in this same object as a plain array, and every
 * mutation copied it: an edit did a `filter` (full array copy) followed by a
 * binary-insert (`[...transactions]`, a second full copy), and the app's
 * context value changed identity on every one of those, so all four tabs
 * re-rendered together no matter which single number actually changed.
 * Screens that need transaction-level data now call the query hooks in
 * `hooks/use-*` directly, which read from SQLite on demand and re-run only
 * when `db/version.ts`'s counter changes — the entities here don't gate that
 * at all, and don't hold anything whose size scales with the ledger.
 */
export interface FinanceEntities {
  accounts: Account[];
  categories: Category[];
  budgets: Budget[];
  quickPresets: QuickPreset[];
  settings: AppSettings;
  isLoaded: boolean;
}

interface FinanceActions {
  addAccount: (input: Omit<Account, 'id' | 'createdAt'>) => Promise<Account>;
  updateAccount: (account: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  addCategory: (input: Omit<Category, 'id'>) => Promise<Category>;
  updateCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addTransaction: (input: Omit<Transaction, 'id' | 'createdAt'>) => Promise<Transaction>;
  updateTransaction: (transaction: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addBudget: (input: Omit<Budget, 'id' | 'createdAt'>) => Promise<Budget>;
  updateBudget: (budget: Budget) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  addPreset: (input: Omit<QuickPreset, 'id'>) => Promise<QuickPreset>;
  updatePreset: (preset: QuickPreset) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  resetAllData: () => Promise<void>;
  seedDemoData: () => Promise<void>;
}

interface FinanceContextValue extends FinanceActions {
  state: FinanceEntities;
  /**
   * Set when the last attempted write failed. Screens surface this rather
   * than letting a failure pass unnoticed — the exact lesson from the old
   * AsyncStorage path, where a swallowed write error was the actual
   * data-loss mechanism, not the storage cap that triggered it.
   */
  persistError: string | null;
  /** True once the blob migration has run (or determined there was nothing to migrate) and a real failure, if any, is known. */
  migrationFailed: boolean;
}

const FinanceContext = createContext<FinanceContextValue | undefined>(undefined);

const defaultSettings: AppSettings = { currency: 'USD', hasOnboarded: false };

function buildDefaultCategories(): Category[] {
  return [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map(c => ({
    ...c,
    id: generateId(),
  }));
}

/** Starting points for the home screen widget, all editable in Settings. */
const PRESET_SEEDS: { label: string; emoji: string; amount: number; category: string }[] = [
  { label: 'Coffee', emoji: '☕', amount: 50, category: 'Food & Dining' },
  { label: 'Commute', emoji: '🚌', amount: 30, category: 'Transport' },
  { label: 'Groceries', emoji: '🛒', amount: 500, category: 'Groceries' },
  { label: 'Snacks', emoji: '🍫', amount: 100, category: 'Food & Dining' },
];

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entities, setEntities] = useState<FinanceEntities>({
    accounts: [],
    categories: [],
    budgets: [],
    quickPresets: [],
    settings: defaultSettings,
    isLoaded: false,
  });
  const [persistError, setPersistError] = useState<string | null>(null);
  const [migrationFailed, setMigrationFailed] = useState(false);

  // Re-render whenever any write in this JS context (this provider, a
  // background migration) bumps the shared counter, and reload the small
  // entity lists from SQLite when it does.
  const dataVersion = useSyncExternalStore(subscribeDataVersion, getDataVersion, getDataVersion);

  // The widget's tap handler runs in Android's headless JS task — a
  // separate JS context with its own module state, so its own
  // `bumpDataVersion()` call (in `utils/widget-data-io.ts`) bumps a
  // *different* counter that this component's `useSyncExternalStore` never
  // sees. Both contexts share the same SQLite file (see `db/client.ts`'s
  // `busy_timeout`), so the fix isn't cross-process signaling — it's simply
  // to re-check on every foreground transition, the same moment a widget
  // tap could plausibly have just happened.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') bumpDataVersion();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDb();
        const [accounts, categories, budgets, quickPresets, settings] = await Promise.all([
          listAccounts(db),
          listCategories(db),
          listBudgets(db),
          listPresets(db),
          getSettings(db),
        ]);
        if (cancelled) return;

        // First launch: SQLite has no categories yet (the migration only
        // seeds from an existing blob). Seed the same defaults the old
        // fresh-install path used, once.
        if (categories.length === 0 && accounts.length === 0 && quickPresets.length === 0) {
          const seededCategories = buildDefaultCategories();
          for (let i = 0; i < seededCategories.length; i++) {
            await insertCategory(db, seededCategories[i], i);
          }
          const presets = PRESET_SEEDS.map(seed => ({
            id: generateId(),
            label: seed.label,
            emoji: seed.emoji,
            amount: seed.amount,
            type: 'expense' as const,
            categoryId: seededCategories.find(c => c.kind === 'expense' && c.name === seed.category)?.id,
          }));
          for (let i = 0; i < presets.length; i++) await insertPreset(db, presets[i], i);

          if (cancelled) return;
          setEntities({
            accounts: [],
            categories: seededCategories,
            budgets: [],
            quickPresets: presets,
            settings,
            isLoaded: true,
          });
        } else {
          setEntities({ accounts, categories, budgets, quickPresets, settings, isLoaded: true });
        }

        const migration = await getBlobMigrationResult();
        if (!cancelled) setMigrationFailed(migration?.status === 'failed');
      } catch (e) {
        if (!cancelled) {
          setPersistError(e instanceof Error ? e.message : 'Could not load your data.');
          setEntities(prev => ({ ...prev, isLoaded: true }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  const withDb = useCallback(
    async <T,>(fn: (db: Awaited<ReturnType<typeof getDb>>) => Promise<T>): Promise<T> => {
      try {
        const db = await getDb();
        const result = await fn(db);
        setPersistError(null);
        return result;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not save your data.';
        setPersistError(message);
        throw e;
      }
    },
    []
  );

  const actions = useMemo<FinanceActions>(
    () => ({
      addAccount: input =>
        withDb(async db => {
          const account: Account = { ...input, id: generateId(), createdAt: new Date().toISOString() };
          await insertAccount(db, account, 999);
          return account;
        }),
      updateAccount: account => withDb(db => dbUpdateAccount(db, account)),
      deleteAccount: id => withDb(db => dbDeleteAccount(db, id)),

      addCategory: input =>
        withDb(async db => {
          const category: Category = { ...input, id: generateId() };
          await insertCategory(db, category, 999);
          return category;
        }),
      updateCategory: category => withDb(db => dbUpdateCategory(db, category)),
      deleteCategory: id => withDb(db => dbDeleteCategory(db, id)),

      addTransaction: input =>
        withDb(async db => {
          const transaction: Transaction = { ...input, id: generateId(), createdAt: new Date().toISOString() };
          await insertTransaction(db, transaction);
          return transaction;
        }),
      updateTransaction: transaction => withDb(db => dbUpdateTransaction(db, transaction)),
      deleteTransaction: id => withDb(db => dbDeleteTransaction(db, id)),

      addBudget: input =>
        withDb(async db => {
          const budget: Budget = { ...input, id: generateId(), createdAt: new Date().toISOString() };
          await insertBudget(db, budget, 999);
          return budget;
        }),
      updateBudget: budget => withDb(db => dbUpdateBudget(db, budget)),
      deleteBudget: id => withDb(db => dbDeleteBudget(db, id)),

      addPreset: input =>
        withDb(async db => {
          const preset: QuickPreset = { ...input, id: generateId() };
          await insertPreset(db, preset, 999);
          return preset;
        }),
      updatePreset: preset => withDb(db => dbUpdatePreset(db, preset)),
      deletePreset: id => withDb(db => dbDeletePreset(db, id)),

      updateSettings: patch => withDb(db => dbUpdateSettings(db, patch)),
      completeOnboarding: () => withDb(db => dbUpdateSettings(db, { hasOnboarded: true })),

      resetAllData: () =>
        withDb(async db => {
          await db.execAsync(
            'DELETE FROM transactions; DELETE FROM accounts; DELETE FROM categories; DELETE FROM budgets; DELETE FROM quick_presets; DELETE FROM rollup; DELETE FROM account_balance; DELETE FROM settings;'
          );
          const seeded = buildDefaultCategories();
          for (let i = 0; i < seeded.length; i++) await insertCategory(db, seeded[i], i);
          await dbUpdateSettings(db, { currency: entities.settings.currency, hasOnboarded: true });
        }),

      seedDemoData: () =>
        withDb(async db => {
          const { buildDemoState } = await import('@/utils/demo-data');
          const demo = buildDemoState();
          await db.execAsync(
            'DELETE FROM transactions; DELETE FROM accounts; DELETE FROM categories; DELETE FROM budgets; DELETE FROM quick_presets; DELETE FROM rollup; DELETE FROM account_balance;'
          );
          for (let i = 0; i < demo.accounts.length; i++) await insertAccount(db, demo.accounts[i], i);
          for (let i = 0; i < demo.categories.length; i++) await insertCategory(db, demo.categories[i], i);
          for (let i = 0; i < demo.budgets.length; i++) await insertBudget(db, demo.budgets[i], i);
          for (const tx of demo.transactions) await insertTransaction(db, tx);
        }),
    }),
    [withDb, entities.settings.currency]
  );

  const value = useMemo<FinanceContextValue>(
    () => ({ state: entities, persistError, migrationFailed, ...actions }),
    [entities, persistError, migrationFailed, actions]
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
};

export function useFinance(): FinanceContextValue {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error('useFinance must be used within a FinanceProvider');
  return ctx;
}

export function accountTypeMeta(type: Account['type']) {
  return ACCOUNT_TYPE_META[type];
}
