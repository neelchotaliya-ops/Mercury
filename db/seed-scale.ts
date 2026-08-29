/**
 * Configurable-scale, multi-feature ledger & entity generator for testing
 * the app at real volume and exercising all modern app features (Settings →
 * "Fill test data" flow).
 *
 * Populates:
 *   - Accounts (multi-type, multi-currency, realistic opening balances)
 *   - Categories (default income & expense categories)
 *   - Subcategories (rich hierarchical category trees)
 *   - Budgets (realistic monthly targets across key spending areas)
 *   - Quick Presets (1-tap widget & quick action presets)
 *   - Recurring Rules (active subscriptions, bills, salary with upcoming schedules)
 *   - Split Expenses & Repayments (shared bills with pending/paid
 *     participants and linked repayment income transactions)
 *   - Transactions (payees, subcategories, contextual notes, recurring links)
 *
 * Generated and inserted in bounded-memory batches, streaming rows to SQLite
 * without high peak memory. No react-native / expo-sqlite direct import,
 * so it is directly testable under `tsx`.
 */

import { Account, Budget, Category, IconName, QuickPreset, RecurringRule, SplitParticipant, Subcategory, Transaction, TransactionType } from '@/types/finance';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES, ACCOUNT_TYPE_META } from '@/constants/categories';
import { Db } from './types';
import { insertAccountRow, insertCategoryRow } from './entities';
import { bulkInsertTransactionRows } from './transactions';
import { rebuildRollups } from './rebuild';
import { bumpDataVersion } from './version';
import { dropBulkIndexes, ensureBulkIndexes } from './schema';
import { formatDateIso } from '@/utils/recurring-engine';

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
  /** Whether to seed subcategories and attach them to transactions. Defaults to true. */
  includeSubcategories?: boolean;
  /** Whether to seed monthly category budgets. Defaults to true. */
  includeBudgets?: boolean;
  /** Whether to seed quick 1-tap presets. Defaults to true. */
  includeQuickPresets?: boolean;
  /** Whether to seed recurring rules. Defaults to true. */
  includeRecurringRules?: boolean;
  /** Whether to seed split expenses and linked repayments. Defaults to true. */
  includeSplitExpenses?: boolean;
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
  subcategories: number;
  budgets: number;
  presets: number;
  recurringRules: number;
  splitExpenses: number;
}

const CHUNK_SIZE = 20_000;
const MAX_ACCOUNTS = 8;

export const ACCOUNT_POOL: { name: string; type: Account['type']; currency: string; balance: number }[] = [
  { name: 'Main Checking', type: 'bank', currency: 'INR', balance: 45000 },
  { name: 'Cash Wallet', type: 'cash', currency: 'INR', balance: 3500 },
  { name: 'Rewards Card', type: 'card', currency: 'INR', balance: 0 },
  { name: 'Vault Savings', type: 'wallet', currency: 'INR', balance: 125000 },
  { name: 'Secondary Bank (Bills)', type: 'bank', currency: 'INR', balance: 18000 },
  { name: 'Travel Forex Card', type: 'card', currency: 'USD', balance: 650 },
  { name: 'Emergency Fund', type: 'wallet', currency: 'INR', balance: 75000 },
  { name: 'Petty Cash', type: 'cash', currency: 'INR', balance: 1500 },
];

const SUBCATEGORY_DEFS: Record<string, { name: string; icon: IconName }[]> = {
  'Food & Dining': [
    { name: 'Restaurants', icon: 'restaurant' },
    { name: 'Cafes & Coffee', icon: 'restaurant' },
    { name: 'Food Delivery', icon: 'bag-handle' },
    { name: 'Fast Food', icon: 'restaurant' },
    { name: 'Pubs & Bars', icon: 'restaurant' },
  ],
  'Groceries': [
    { name: 'Supermarket', icon: 'cart' },
    { name: 'Fruits & Veggies', icon: 'cart' },
    { name: 'Dairy & Bakery', icon: 'cart' },
    { name: 'Meat & Seafood', icon: 'cart' },
  ],
  'Transport': [
    { name: 'Fuel & Gas', icon: 'car' },
    { name: 'Cab & Rideshare', icon: 'car' },
    { name: 'Public Transit', icon: 'car' },
    { name: 'Parking & Tolls', icon: 'car' },
  ],
  'Shopping': [
    { name: 'Clothing & Apparel', icon: 'bag-handle' },
    { name: 'Electronics', icon: 'phone-portrait' },
    { name: 'Home & Kitchen', icon: 'home' },
    { name: 'Books & Stationery', icon: 'school' },
  ],
  'Bills & Utilities': [
    { name: 'Electricity', icon: 'flash' },
    { name: 'Water', icon: 'receipt' },
    { name: 'Internet / WiFi', icon: 'receipt' },
    { name: 'Mobile Recharge', icon: 'phone-portrait' },
  ],
  'Entertainment': [
    { name: 'Movies & Cinema', icon: 'film' },
    { name: 'Gaming', icon: 'game-controller' },
    { name: 'Streaming & OTT', icon: 'film' },
    { name: 'Events & Concerts', icon: 'film' },
  ],
  'Health': [
    { name: 'Pharmacy & Medicine', icon: 'medkit' },
    { name: 'Doctor Consultation', icon: 'medkit' },
    { name: 'Gym & Fitness', icon: 'fitness' },
  ],
  'Housing': [
    { name: 'House Rent', icon: 'home' },
    { name: 'Maintenance', icon: 'construct' },
    { name: 'Repairs & Plumbing', icon: 'construct' },
  ],
  'Subscriptions': [
    { name: 'Video Streaming', icon: 'repeat' },
    { name: 'Music', icon: 'repeat' },
    { name: 'Software & Cloud', icon: 'repeat' },
  ],
  'Salary': [
    { name: 'Base Salary', icon: 'cash' },
    { name: 'Bonus & Incentives', icon: 'cash' },
  ],
  'Business': [
    { name: 'Client Invoices', icon: 'briefcase' },
    { name: 'Consulting Fees', icon: 'briefcase' },
  ],
  'Investments': [
    { name: 'Dividends', icon: 'trending-up' },
    { name: 'Interest Payout', icon: 'trending-up' },
  ],
};

const PAYEE_DEFS: Record<string, string[]> = {
  'Food & Dining': ['Swiggy', 'Zomato', 'Starbucks', "McDonald's", 'Blue Tokai', 'Subway', "Domino's Pizza", 'Chai Point', 'Local Bistro'],
  'Groceries': ['Blinkit', 'Zepto', 'Instamart', "Nature's Basket", 'DMart', 'BigBasket', 'Trader Joe', 'Local Supermarket'],
  'Transport': ['Uber', 'Ola Cabs', 'Shell Petrol', 'Indian Oil', 'HP Fuel', 'Metro SmartCard', 'Fastag Toll'],
  'Shopping': ['Amazon', 'Flipkart', 'Zara', 'H&M', 'Apple Store', 'Uniqlo', 'Nike', 'IKEA', 'Myntra'],
  'Bills & Utilities': ['Tata Power', 'Airtel Broadband', 'Jio Fiber', 'City Water Board', 'BESCOM Power', 'Indane Gas'],
  'Entertainment': ['BookMyShow', 'PVR Cinemas', 'Steam Games', 'Sony PlayStation', 'Spotify', 'Disney+ Hotstar'],
  'Health': ['Apollo Pharmacy', 'Practo Clinic', 'Cult.fit', 'Pharmeasy', 'Care Dental', 'Dr Lal Pathlabs'],
  'Housing': ['Society Maintenance', 'Urban Company', 'IKEA Home', 'City Plumbing Care'],
  'Subscriptions': ['Netflix', 'Spotify', 'Amazon Prime', 'YouTube Premium', 'iCloud Storage', 'ChatGPT Plus', 'GitHub'],
  'Education': ['Coursera', 'Udemy', 'Kindle Books', "O'Reilly Media", 'Harvard Online'],
  'Travel': ['MakeMyTrip', 'Airbnb', 'IndiGo Airlines', 'Booking.com', 'Uber Intercity', 'Taj Hotels'],
  'Salary': ['Acme Corp (Payroll)', 'Google LLC', 'Tech Innovations Inc', 'Employer Direct Deposit'],
  'Business': ['Client Milestone Payout', 'Stripe Payout', 'Upwork Escrow', 'Consulting Invoice #1042'],
  'Investments': ['Zerodha Broking', 'Groww Dividends', 'Vanguard Fund', 'Bank Interest Credit'],
  'Gifts': ['Family Gift', 'Birthday Present', 'Festival Gift'],
  'Loans & EMI': ['HDFC Home Loan EMI', 'ICICI Auto Loan', 'Student Loan Repayment'],
};

const EXPENSE_NOTES = [
  'Dinner with team',
  'Weekly groceries run',
  'Uber ride to airport',
  'Office supplies',
  'Monthly electricity bill',
  'Coffee with friend',
  'Movie tickets',
  'Fuel fill up',
  'Weekend outing',
  'Household essentials',
  'Pharmacy medicines',
  'Subscription renewal',
  'Home maintenance work',
  'Dinner at cafe',
  'Snacks and drinks',
];

const INCOME_NOTES = [
  'Monthly salary credit',
  'Freelance consulting project',
  'Quarterly dividend payout',
  'Cashback reward',
  'Birthday gift from family',
  'Project completion bonus',
  'Client milestone payment',
];

const TRANSFER_NOTES = [
  'Transfer to savings',
  'Pay off credit card',
  'Move to cash wallet',
  'Emergency fund allocation',
  'Monthly allowance',
];

/** A small, fast, decent-quality PRNG (mulberry32). */
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
  categoryNameMap?: Map<string, string>;
  subcategoriesByCatId?: Map<string, string[]>;
  recurringRuleIds?: string[];
  seed: number;
}

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
  const categoryNameMap = params.categoryNameMap ?? new Map();
  const subcategoriesByCatId = params.subcategoriesByCatId ?? new Map();
  const recurringRuleIds = params.recurringRuleIds ?? [];

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

    let subcategoryId: string | undefined;
    let payee: string | undefined;
    let note: string | undefined;

    if (categoryId) {
      const catName = categoryNameMap.get(categoryId) ?? '';
      const subcatList = subcategoriesByCatId.get(categoryId);
      if (subcatList && subcatList.length > 0 && rand() < 0.65) {
        subcategoryId = subcatList[Math.floor(rand() * subcatList.length)];
      }

      const payeePool = PAYEE_DEFS[catName];
      if (payeePool && payeePool.length > 0 && rand() < 0.6) {
        payee = payeePool[Math.floor(rand() * payeePool.length)];
      }

      if (rand() < 0.4) {
        const notePool = type === 'expense' ? EXPENSE_NOTES : INCOME_NOTES;
        note = notePool[Math.floor(rand() * notePool.length)];
      }
    } else if (type === 'transfer' && rand() < 0.3) {
      note = TRANSFER_NOTES[Math.floor(rand() * TRANSFER_NOTES.length)];
    }

    // Link a small fraction of transactions to recurring rules
    let recurringRuleId: string | undefined;
    if (recurringRuleIds.length > 0 && type !== 'transfer' && rand() < 0.05) {
      recurringRuleId = recurringRuleIds[Math.floor(rand() * recurringRuleIds.length)];
    }

    const amount = Math.round((params.minAmount + rand() * amountSpan) * 100) / 100;

    yield {
      id: `seed-${i}`,
      type,
      amount,
      accountId: fromAccount,
      toAccountId: type === 'transfer' ? toAccount : undefined,
      categoryId,
      subcategoryId,
      payee,
      date,
      note,
      recurringRuleId,
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
    initialBalance: a.balance,
    currency: a.currency,
    createdAt: now,
  }));
}

function buildSeedCategories(): Category[] {
  return [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map((c, i) => ({
    ...c,
    id: `seed-cat-${i}`,
  }));
}

function buildSeedSubcategories(categories: Category[]): Subcategory[] {
  const result: Subcategory[] = [];
  let subIndex = 0;
  for (const cat of categories) {
    const defs = SUBCATEGORY_DEFS[cat.name];
    if (defs && defs.length > 0) {
      for (const def of defs) {
        result.push({
          id: `seed-subcat-${subIndex++}`,
          categoryId: cat.id,
          name: def.name,
          icon: def.icon,
          color: cat.color,
          isDefault: true,
        });
      }
    }
  }
  return result;
}

function buildSeedBudgets(categories: Category[], accounts: Account[]): Budget[] {
  const targetNames: Record<string, number> = {
    'Groceries': 15000,
    'Food & Dining': 10000,
    'Shopping': 8000,
    'Transport': 6000,
    'Bills & Utilities': 7000,
    'Entertainment': 4000,
    'Subscriptions': 2500,
  };

  const primaryAccount = accounts[0];
  const now = new Date().toISOString();
  const budgets: Budget[] = [];
  let sortOrder = 0;

  for (const cat of categories) {
    if (cat.name in targetNames) {
      budgets.push({
        id: `seed-budget-${sortOrder}`,
        categoryId: cat.id,
        monthlyLimit: targetNames[cat.name],
        accountId: primaryAccount?.id,
        currency: primaryAccount?.currency ?? 'INR',
        createdAt: now,
      });
      sortOrder++;
    }
  }
  return budgets;
}

function buildSeedQuickPresets(categories: Category[], accounts: Account[]): QuickPreset[] {
  const byName = new Map(categories.map(c => [c.name, c.id]));
  const primaryAccId = accounts[0]?.id;

  const presetsData: Array<{ label: string; emoji: string; amount: number; type: 'income' | 'expense'; catName: string }> = [
    { label: 'Morning Coffee', emoji: '☕', amount: 150, type: 'expense', catName: 'Food & Dining' },
    { label: 'Daily Groceries', emoji: '🛒', amount: 600, type: 'expense', catName: 'Groceries' },
    { label: 'Cab to Work', emoji: '🚕', amount: 350, type: 'expense', catName: 'Transport' },
    { label: 'Office Lunch', emoji: '🍱', amount: 400, type: 'expense', catName: 'Food & Dining' },
    { label: 'Fuel / Petrol', emoji: '⛽', amount: 1500, type: 'expense', catName: 'Transport' },
    { label: 'Freelance Payment', emoji: '💻', amount: 15000, type: 'income', catName: 'Business' },
  ];

  return presetsData.map((p, i) => ({
    id: `seed-preset-${i}`,
    label: p.label,
    emoji: p.emoji,
    amount: p.amount,
    type: p.type,
    categoryId: byName.get(p.catName),
    accountId: primaryAccId,
  }));
}

function buildSeedRecurringRules(
  accounts: Account[],
  categories: Category[],
  subcategories: Subcategory[]
): RecurringRule[] {
  const catMap = new Map(categories.map(c => [c.name, c.id]));
  const subcatMap = new Map(subcategories.map(s => [s.name, s.id]));
  const primaryAccountId = accounts[0]?.id ?? 'seed-acc-0';
  const now = new Date();
  const nowIso = now.toISOString();

  const nextDateWithDay = (day: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), day);
    if (d <= now) {
      d.setMonth(d.getMonth() + 1);
    }
    return formatDateIso(d);
  };

  const nextSunday = () => {
    const d = new Date(now);
    const dayOfWeek = d.getDay();
    const distance = (7 - dayOfWeek) % 7 || 7;
    d.setDate(d.getDate() + distance);
    return formatDateIso(d);
  };

  const rulesData: Array<Omit<RecurringRule, 'id' | 'createdAt'>> = [
    {
      type: 'income',
      amount: 85000,
      accountId: primaryAccountId,
      categoryId: catMap.get('Salary'),
      subcategoryId: subcatMap.get('Base Salary'),
      payee: 'Acme Corp (Payroll)',
      note: 'Monthly Salary',
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().slice(0, 10),
      nextDue: nextDateWithDay(1),
      autoCreate: true,
      reminderDays: 1,
      active: true,
    },
    {
      type: 'expense',
      amount: 22000,
      accountId: primaryAccountId,
      categoryId: catMap.get('Housing'),
      subcategoryId: subcatMap.get('House Rent'),
      payee: 'Landlord',
      note: 'House Rent',
      frequency: 'monthly',
      dayOfMonth: 5,
      startDate: new Date(now.getFullYear(), now.getMonth() - 6, 5).toISOString().slice(0, 10),
      nextDue: nextDateWithDay(5),
      autoCreate: false,
      reminderDays: 2,
      active: true,
    },
    {
      type: 'expense',
      amount: 649,
      accountId: primaryAccountId,
      categoryId: catMap.get('Subscriptions'),
      subcategoryId: subcatMap.get('Video Streaming'),
      payee: 'Netflix',
      note: 'Netflix 4K Subscription',
      frequency: 'monthly',
      dayOfMonth: 15,
      startDate: new Date(now.getFullYear(), now.getMonth() - 6, 15).toISOString().slice(0, 10),
      nextDue: nextDateWithDay(15),
      autoCreate: true,
      reminderDays: 1,
      active: true,
    },
    {
      type: 'expense',
      amount: 199,
      accountId: primaryAccountId,
      categoryId: catMap.get('Subscriptions'),
      subcategoryId: subcatMap.get('Music'),
      payee: 'Spotify',
      note: 'Spotify Family Plan',
      frequency: 'monthly',
      dayOfMonth: 20,
      startDate: new Date(now.getFullYear(), now.getMonth() - 6, 20).toISOString().slice(0, 10),
      nextDue: nextDateWithDay(20),
      autoCreate: true,
      reminderDays: 1,
      active: true,
    },
    {
      type: 'expense',
      amount: 999,
      accountId: primaryAccountId,
      categoryId: catMap.get('Bills & Utilities'),
      subcategoryId: subcatMap.get('Internet / WiFi'),
      payee: 'Airtel Broadband',
      note: 'High Speed Fiber',
      frequency: 'monthly',
      dayOfMonth: 10,
      startDate: new Date(now.getFullYear(), now.getMonth() - 6, 10).toISOString().slice(0, 10),
      nextDue: nextDateWithDay(10),
      autoCreate: true,
      reminderDays: 2,
      active: true,
    },
    {
      type: 'expense',
      amount: 2500,
      accountId: primaryAccountId,
      categoryId: catMap.get('Health'),
      subcategoryId: subcatMap.get('Gym & Fitness'),
      payee: 'Cult.fit',
      note: 'Gym Membership',
      frequency: 'monthly',
      dayOfMonth: 1,
      startDate: new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10),
      nextDue: nextDateWithDay(1),
      autoCreate: false,
      reminderDays: 3,
      active: true,
    },
    {
      type: 'expense',
      amount: 1800,
      accountId: primaryAccountId,
      categoryId: catMap.get('Groceries'),
      subcategoryId: subcatMap.get('Fruits & Veggies'),
      payee: 'Organic Market',
      note: 'Weekly Farmers Market',
      frequency: 'weekly',
      dayOfWeek: 0,
      startDate: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10),
      nextDue: nextSunday(),
      autoCreate: false,
      reminderDays: 1,
      active: true,
    },
  ];

  return rulesData.map((r, i) => ({
    ...r,
    id: `seed-recurring-${i}`,
    createdAt: nowIso,
  }));
}

interface SplitSeedBundle {
  transactions: Transaction[];
  participants: SplitParticipant[];
}

function buildSeedSplitExpenses(accounts: Account[], categories: Category[]): SplitSeedBundle {
  const primaryAccountId = accounts[0]?.id ?? 'seed-acc-0';
  const travelCat = categories.find(c => c.name === 'Travel')?.id;
  const foodCat = categories.find(c => c.name === 'Food & Dining')?.id;
  const billsCat = categories.find(c => c.name === 'Bills & Utilities')?.id;
  const entCat = categories.find(c => c.name === 'Entertainment')?.id;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const transactions: Transaction[] = [];
  const participants: SplitParticipant[] = [];

  // 1. Weekend Trip to Hills (Total 14,000, 4 participants @ 3,500 each)
  const tripTxId = 'seed-split-tx-1';
  const tripDate = new Date(now - 12 * dayMs).toISOString();
  transactions.push({
    id: tripTxId,
    type: 'expense',
    amount: 14000,
    accountId: primaryAccountId,
    categoryId: travelCat,
    payee: 'Mountain Resort',
    note: 'Weekend Trip to Hills',
    date: tripDate,
    createdAt: tripDate,
  });

  const tripSettledDate = new Date(now - 10 * dayMs).toISOString();
  participants.push(
    {
      id: 'seed-sp-1',
      transactionId: tripTxId,
      name: 'Alex',
      shareAmount: 3500,
      paidAmount: 3500,
      status: 'paid',
      settledAt: tripSettledDate,
      createdAt: tripDate,
    },
    {
      id: 'seed-sp-2',
      transactionId: tripTxId,
      name: 'Priya',
      shareAmount: 3500,
      paidAmount: 0,
      status: 'pending',
      createdAt: tripDate,
    },
    {
      id: 'seed-sp-3',
      transactionId: tripTxId,
      name: 'Rahul',
      shareAmount: 3500,
      paidAmount: 0,
      status: 'pending',
      createdAt: tripDate,
    }
  );

  // Repayment income for Alex's full share; Priya still owes hers.
  transactions.push({
    id: 'seed-repay-1',
    type: 'income',
    amount: 3500,
    accountId: primaryAccountId,
    note: 'Repayment from Alex',
    date: tripSettledDate,
    createdAt: tripSettledDate,
    splitExpenseId: tripTxId,
  });

  // 2. Dinner at Olive Garden (Total 4,800, 3 participants @ 1,600 each)
  const dinnerTxId = 'seed-split-tx-2';
  const dinnerDate = new Date(now - 4 * dayMs).toISOString();
  transactions.push({
    id: dinnerTxId,
    type: 'expense',
    amount: 4800,
    accountId: primaryAccountId,
    categoryId: foodCat,
    payee: 'Olive Garden',
    note: 'Dinner with friends',
    date: dinnerDate,
    createdAt: dinnerDate,
  });

  const dinnerSettledDate = new Date(now - 2 * dayMs).toISOString();
  participants.push(
    {
      id: 'seed-sp-4',
      transactionId: dinnerTxId,
      name: 'Maya',
      shareAmount: 1600,
      paidAmount: 1600,
      status: 'paid',
      settledAt: dinnerSettledDate,
      createdAt: dinnerDate,
    },
    {
      id: 'seed-sp-5',
      transactionId: dinnerTxId,
      name: 'Rohan',
      shareAmount: 1600,
      paidAmount: 0,
      status: 'pending',
      createdAt: dinnerDate,
    }
  );

  transactions.push({
    id: 'seed-repay-3',
    type: 'income',
    amount: 1600,
    accountId: primaryAccountId,
    note: 'Repayment from Maya',
    date: dinnerSettledDate,
    createdAt: dinnerSettledDate,
    splitExpenseId: dinnerTxId,
  });

  // 3. Apartment WiFi & Electricity (Total 2,400)
  const billsTxId = 'seed-split-tx-3';
  const billsDate = new Date(now - 8 * dayMs).toISOString();
  transactions.push({
    id: billsTxId,
    type: 'expense',
    amount: 2400,
    accountId: primaryAccountId,
    categoryId: billsCat,
    payee: 'Airtel Broadband',
    note: 'Apartment WiFi Bill',
    date: billsDate,
    createdAt: billsDate,
  });

  const billsSettledDate = new Date(now - 7 * dayMs).toISOString();
  participants.push({
    id: 'seed-sp-6',
    transactionId: billsTxId,
    name: 'Jordan',
    shareAmount: 1200,
    paidAmount: 1200,
    status: 'paid',
    settledAt: billsSettledDate,
    createdAt: billsDate,
  });

  transactions.push({
    id: 'seed-repay-4',
    type: 'income',
    amount: 1200,
    accountId: primaryAccountId,
    note: 'Repayment from Jordan',
    date: billsSettledDate,
    createdAt: billsSettledDate,
    splitExpenseId: billsTxId,
  });

  // 4. Concert Tickets Booking (Total 9,000)
  const concertTxId = 'seed-split-tx-4';
  const concertDate = new Date(now - 1 * dayMs).toISOString();
  transactions.push({
    id: concertTxId,
    type: 'expense',
    amount: 9000,
    accountId: primaryAccountId,
    categoryId: entCat,
    payee: 'BookMyShow',
    note: 'Concert Tickets',
    date: concertDate,
    createdAt: concertDate,
  });

  participants.push(
    {
      id: 'seed-sp-7',
      transactionId: concertTxId,
      name: 'Alex',
      shareAmount: 3000,
      paidAmount: 0,
      status: 'pending',
      createdAt: concertDate,
    },
    {
      id: 'seed-sp-8',
      transactionId: concertTxId,
      name: 'Elena',
      shareAmount: 3000,
      paidAmount: 0,
      status: 'pending',
      createdAt: concertDate,
    }
  );

  return { transactions, participants };
}

/**
 * Wipes existing data and fills the database with configurable synthetic
 * entities and ledger transactions across all app features.
 */
export async function seedScaleData(db: Db, options: ScaleSeedOptions): Promise<ScaleSeedResult> {
  const includeSubcategories = options.includeSubcategories !== false;
  const includeBudgets = options.includeBudgets !== false;
  const includeQuickPresets = options.includeQuickPresets !== false;
  const includeRecurringRules = options.includeRecurringRules !== false;
  const includeSplitExpenses = options.includeSplitExpenses !== false;

  const accounts = buildSeedAccounts(options.accountCount);
  const categories = buildSeedCategories();
  const subcategories = includeSubcategories ? buildSeedSubcategories(categories) : [];
  const budgets = includeBudgets ? buildSeedBudgets(categories, accounts) : [];
  const presets = includeQuickPresets ? buildSeedQuickPresets(categories, accounts) : [];
  const recurringRules = includeRecurringRules ? buildSeedRecurringRules(accounts, categories, subcategories) : [];
  const splitBundle = includeSplitExpenses ? buildSeedSplitExpenses(accounts, categories) : { transactions: [], participants: [] };

  await db.withTransaction(async txn => {
    await txn.execAsync(`
      DELETE FROM split_participants;
      DELETE FROM recurring_rules;
      DELETE FROM subcategories;
      DELETE FROM budgets;
      DELETE FROM quick_presets;
      DELETE FROM transactions;
      DELETE FROM accounts;
      DELETE FROM categories;
      DELETE FROM rollup;
      DELETE FROM account_balance;
    `);

    // Insert accounts
    for (let i = 0; i < accounts.length; i++) {
      const a = accounts[i];
      await txn.runAsync(
        `INSERT INTO accounts (id, name, type, icon, color, initial_balance, currency, created_at, archived, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, a.name, a.type, a.icon, a.color, a.initialBalance, a.currency ?? 'INR', a.createdAt, 0, i]
      );
      await txn.runAsync('INSERT OR IGNORE INTO account_balance (account_id, delta) VALUES (?, 0)', [a.id]);
    }

    // Insert categories
    for (let i = 0; i < categories.length; i++) {
      const c = categories[i];
      await txn.runAsync(
        `INSERT INTO categories (id, name, icon, color, kind, is_default, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [c.id, c.name, c.icon, c.color, c.kind, c.isDefault ? 1 : 0, i]
      );
    }

    // Insert subcategories
    for (let i = 0; i < subcategories.length; i++) {
      const s = subcategories[i];
      await txn.runAsync(
        `INSERT INTO subcategories (id, category_id, name, icon, color, is_default, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.categoryId, s.name, s.icon, s.color, s.isDefault ? 1 : 0, i]
      );
    }

    // Insert budgets
    for (let i = 0; i < budgets.length; i++) {
      const b = budgets[i];
      await txn.runAsync(
        `INSERT INTO budgets (id, category_id, monthly_limit, account_id, currency, created_at, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [b.id, b.categoryId, b.monthlyLimit, b.accountId ?? null, b.currency ?? 'INR', b.createdAt, i]
      );
    }

    // Insert quick presets
    for (let i = 0; i < presets.length; i++) {
      const p = presets[i];
      await txn.runAsync(
        `INSERT INTO quick_presets (id, label, emoji, amount, type, category_id, account_id, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.label, p.emoji, p.amount, p.type, p.categoryId ?? null, p.accountId ?? null, i]
      );
    }

    // Insert recurring rules
    for (const r of recurringRules) {
      await txn.runAsync(
        `INSERT INTO recurring_rules
           (id, type, amount, account_id, category_id, subcategory_id, payee, note,
            frequency, interval_unit, interval_value, day_of_week, day_of_month,
            start_date, end_date, next_due, auto_create, reminder_days, active, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          r.id,
          r.type,
          r.amount,
          r.accountId,
          r.categoryId ?? null,
          r.subcategoryId ?? null,
          r.payee ?? null,
          r.note ?? null,
          r.frequency,
          r.intervalUnit ?? null,
          r.intervalValue ?? null,
          r.dayOfWeek ?? null,
          r.dayOfMonth ?? null,
          r.startDate,
          r.endDate ?? null,
          r.nextDue,
          r.autoCreate ? 1 : 0,
          r.reminderDays,
          r.active ? 1 : 0,
          r.createdAt,
        ]
      );
    }
  });

  // Bulk drop indexes for high-speed transaction loading
  await dropBulkIndexes(db);

  let buffer: Transaction[] = [...splitBundle.transactions];
  let inserted = splitBundle.transactions.length;
  let cancelled = false;

  const categoryNameMap = new Map(categories.map(c => [c.id, c.name]));
  const subcategoriesByCatId = new Map<string, string[]>();
  for (const s of subcategories) {
    const list = subcategoriesByCatId.get(s.categoryId) ?? [];
    list.push(s.id);
    subcategoriesByCatId.set(s.categoryId, list);
  }

  try {
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
      categoryNameMap,
      subcategoriesByCatId,
      recurringRuleIds: recurringRules.map(r => r.id),
      seed: Date.now() & 0x7fffffff,
    });

    for (const tx of gen) {
      buffer.push(tx);
      if (buffer.length >= CHUNK_SIZE) {
        await bulkInsertTransactionRows(db, buffer);
        inserted += buffer.length;
        buffer = [];
        options.onProgress?.(inserted, options.count);
        await db.execAsync('PRAGMA wal_checkpoint(PASSIVE)').catch(() => {});
        if (options.shouldCancel?.()) {
          cancelled = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    if (!cancelled && buffer.length > 0) {
      await bulkInsertTransactionRows(db, buffer);
      inserted += buffer.length;
      options.onProgress?.(inserted, options.count);
    }
  } finally {
    await ensureBulkIndexes(db);
  }

  // Insert split participants now that transactions are present
  if (splitBundle.participants.length > 0) {
    await db.withTransaction(async txn => {
      for (const sp of splitBundle.participants) {
        await txn.runAsync(
          `INSERT INTO split_participants
             (id, transaction_id, name, share_amount, paid_amount, status, note, settled_at, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            sp.id,
            sp.transactionId,
            sp.name,
            sp.shareAmount,
            sp.paidAmount,
            sp.status,
            sp.note ?? null,
            sp.settledAt ?? null,
            sp.createdAt,
          ]
        );
      }
    });
  }

  await rebuildRollups(db);
  bumpDataVersion();

  return {
    inserted,
    cancelled,
    accounts: accounts.length,
    categories: categories.length,
    subcategories: subcategories.length,
    budgets: budgets.length,
    presets: presets.length,
    recurringRules: recurringRules.length,
    splitExpenses: splitBundle.participants.length > 0 ? 4 : 0,
  };
}
