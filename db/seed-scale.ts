/**
 * Configurable-scale, fully-random ledger generator for testing the app at
 * real volume (the Settings → "Fill test data" flow).
 *
 * Deliberately unlike `utils/demo-data.ts`'s `buildDemoState()`: that one
 * builds a small, realistic-looking ledger (recurring rent on the 1st,
 * salary deposits, weekly groceries) meant to make a fresh install look
 * lived-in. This one is the opposite on purpose — every field (date, amount,
 * account, category, type) is drawn independently and uniformly at random
 * within whatever range the caller picks, with no recurring structure at
 * all, because the point is to stress-test charts and lists against noisy,
 * unpatterned data, not to look believable.
 *
 * Generated and inserted in bounded-memory batches, the same way Phase 8's
 * streaming import works — never materializing the whole ledger in JS, so
 * 100M rows costs the same peak memory as 1M. No `react-native`/
 * `expo-sqlite` import, so it's directly testable under `tsx`.
 */

import { Account, Category, Transaction, TransactionType } from '@/types/finance';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, ACCOUNT_TYPE_META } from '@/constants/categories';
import { Db } from './types';
import { insertAccount, insertCategory } from './entities';
import { bulkInsertTransactionRows } from './transactions';
import { rebuildRollups } from './rebuild';
import { bumpDataVersion } from './version';

export interface ScaleSeedOptions {
  /** How many transactions to generate. */
  count: number;
  /** How many years back from today the random dates are drawn from. */
  years: number;
  /** Inclusive random amount range. */
  minAmount: number;
  maxAmount: number;
  /**
   * Relative weights for expense/income/transfer — any positive numbers,
   * normalized internally, so `{expense: 6, income: 3, transfer: 1}` and
   * `{expense: 60, income: 30, transfer: 10}` are the same mix.
   */
  expenseWeight: number;
  incomeWeight: number;
  transferWeight: number;
  /** How many synthetic accounts to spread the ledger across (1-8). */
  accountCount: number;
  /** Called after each batch is committed. */
  onProgress?: (inserted: number, total: number) => void;
  /** Checked after each batch; returning true stops the run (already-inserted rows are kept). */
  shouldCancel?: () => boolean;
}

export interface ScaleSeedResult {
  inserted: number;
  cancelled: boolean;
  accounts: number;
  categories: number;
}

const CHUNK_SIZE = 20_000;
const MAX_ACCOUNTS = 8;

const ACCOUNT_POOL: { name: string; type: Account['type'] }[] = [
  { name: 'Main Checking', type: 'bank' },
  { name: 'Cash Wallet', type: 'cash' },
  { name: 'Rewards Card', type: 'card' },
  { name: 'Vault Savings', type: 'wallet' },
  { name: 'Business Account', type: 'bank' },
  { name: 'Travel Card', type: 'card' },
  { name: 'Emergency Fund', type: 'wallet' },
  { name: 'Petty Cash', type: 'cash' },
];

/** A small, fast, decent-quality PRNG (mulberry32) — Math.random() is fine too, but a seeded generator keeps a single run reproducible if the seed is ever surfaced later. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface GenParams {
  count: number;
  years: number;
  minAmount: number;
  maxAmount: number;
  expenseWeight: number;
  incomeWeight: number;
  transferWeight: number;
  accountIds: string[];
  expenseCategoryIds: string[];
  incomeCategoryIds: string[];
  seed: number;
}

/**
 * Every field independently uniform-random within its range — no day-of-
 * month, weekday, or amount clustering of any kind. `id` is the loop index,
 * which is unique by construction and far cheaper than checking a
 * collision-prone random id against millions of prior ones.
 */
export function* generateRandomLedger(params: GenParams): Generator<Transaction> {
  const rand = mulberry32(params.seed);
  const totalWeight = params.expenseWeight + params.incomeWeight + params.transferWeight || 1;
  const pExpense = params.expenseWeight / totalWeight;
  const pIncome = params.incomeWeight / totalWeight;

  const nowMs = Date.now();
  const spanMs = Math.max(params.years, 0.01) * 365 * 24 * 60 * 60 * 1000;
  const startMs = nowMs - spanMs;
  const amountSpan = Math.max(params.maxAmount - params.minAmount, 0);
  const accountIds = params.accountIds;

  for (let i = 0; i < params.count; i++) {
    const r = rand();
    const type: TransactionType = r < pExpense ? 'expense' : r < pExpense + pIncome ? 'income' : 'transfer';

    const ts = startMs + Math.floor(rand() * spanMs);
    const date = new Date(ts).toISOString();

    const fromAccount = accountIds[Math.floor(rand() * accountIds.length)];
    let toAccount: string | undefined;
    if (type === 'transfer') {
      toAccount = accountIds[Math.floor(rand() * accountIds.length)];
      if (toAccount === fromAccount && accountIds.length > 1) {
        toAccount = accountIds[(accountIds.indexOf(fromAccount) + 1) % accountIds.length];
      }
    }

    const categoryPool = type === 'income' ? params.incomeCategoryIds : params.expenseCategoryIds;
    const categoryId = type === 'transfer' ? undefined : categoryPool[Math.floor(rand() * categoryPool.length)];

    const amount = Math.round((params.minAmount + rand() * amountSpan) * 100) / 100;

    yield {
      id: `seed-${i}`,
      type,
      amount,
      accountId: fromAccount,
      toAccountId: type === 'transfer' ? toAccount : undefined,
      categoryId,
      date,
      note: rand() < 0.2 ? `Random entry #${i}` : undefined,
      createdAt: date,
    };
  }
}

function buildSeedAccounts(accountCount: number): Account[] {
  const count = Math.max(1, Math.min(MAX_ACCOUNTS, Math.round(accountCount)));
  const now = new Date().toISOString();
  return ACCOUNT_POOL.slice(0, count).map((a, i) => ({
    id: `seed-acc-${i}`,
    name: a.name,
    type: a.type,
    icon: ACCOUNT_TYPE_META[a.type].icon,
    color: ACCOUNT_TYPE_META[a.type].color,
    initialBalance: Math.round((500 + Math.random() * 9500) * 100) / 100,
    createdAt: now,
  }));
}

function buildSeedCategories(): Category[] {
  return [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map((c, i) => ({
    ...c,
    id: `seed-cat-${i}`,
  }));
}

/**
 * Wipes existing data and fills the ledger with `options.count` fully-random
 * synthetic transactions, generated and inserted in bounded-memory batches.
 * Reuses the same batched-insert + single-rebuild path Phase 8's streaming
 * import uses (`bulkInsertTransactionRows` + one `rebuildRollups()` at the
 * end), since "insert a huge number of rows fast" is the same problem
 * either way.
 */
export async function seedScaleData(db: Db, options: ScaleSeedOptions): Promise<ScaleSeedResult> {
  const accounts = buildSeedAccounts(options.accountCount);
  const categories = buildSeedCategories();

  await db.withTransaction(async txn => {
    await txn.execAsync(
      'DELETE FROM transactions; DELETE FROM accounts; DELETE FROM categories; DELETE FROM budgets; DELETE FROM quick_presets; DELETE FROM rollup; DELETE FROM account_balance;'
    );
  });
  for (let i = 0; i < accounts.length; i++) await insertAccount(db, accounts[i], i);
  for (let i = 0; i < categories.length; i++) await insertCategory(db, categories[i], i);

  const gen = generateRandomLedger({
    count: options.count,
    years: options.years,
    minAmount: options.minAmount,
    maxAmount: options.maxAmount,
    expenseWeight: options.expenseWeight,
    incomeWeight: options.incomeWeight,
    transferWeight: options.transferWeight,
    accountIds: accounts.map(a => a.id),
    expenseCategoryIds: categories.filter(c => c.kind === 'expense').map(c => c.id),
    incomeCategoryIds: categories.filter(c => c.kind === 'income').map(c => c.id),
    seed: Date.now() & 0x7fffffff,
  });

  let buffer: Transaction[] = [];
  let inserted = 0;
  let cancelled = false;

  for (const tx of gen) {
    buffer.push(tx);
    if (buffer.length >= CHUNK_SIZE) {
      await bulkInsertTransactionRows(db, buffer);
      inserted += buffer.length;
      buffer = [];
      options.onProgress?.(inserted, options.count);
      if (options.shouldCancel?.()) {
        cancelled = true;
        break;
      }
      // Yield to the JS event loop between chunks so the UI (progress bar,
      // a Cancel tap) stays responsive across a run that can take minutes.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  if (!cancelled && buffer.length > 0) {
    await bulkInsertTransactionRows(db, buffer);
    inserted += buffer.length;
    options.onProgress?.(inserted, options.count);
  }

  // Rebuild regardless of cancellation — whatever got inserted should still
  // read correctly, not leave the aggregate tables partially stale.
  await rebuildRollups(db);
  bumpDataVersion();

  return { inserted, cancelled, accounts: accounts.length, categories: categories.length };
}
