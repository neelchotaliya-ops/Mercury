import { Ionicons } from '@expo/vector-icons';

export type IconName = keyof typeof Ionicons.glyphMap;

export type AccountType = 'cash' | 'bank' | 'card' | 'wallet' | 'other';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  icon: IconName;
  color: string;
  initialBalance: number;
  currency?: string;
  createdAt: string;
  archived?: boolean;
}

export type CategoryKind = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  icon: IconName;
  color: string;
  kind: CategoryKind;
  isDefault?: boolean;
}

// ---- Subcategories ----------------------------------------------------------

export interface Subcategory {
  id: string;
  /** The parent category this belongs to. */
  categoryId: string;
  name: string;
  icon: IconName;
  color: string;
  isDefault?: boolean;
}

// ---- Transactions -----------------------------------------------------------

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  accountId: string;
  toAccountId?: string;
  categoryId?: string;
  /** Optional subcategory within the category (e.g. "Netflix" under "Subscriptions"). */
  subcategoryId?: string;
  /** Free-text merchant / payee name (e.g. "Swiggy", "Amazon"). */
  payee?: string;
  date: string;
  note?: string;
  createdAt: string;
  /** Set when this transaction was created by a recurring rule. */
  recurringRuleId?: string;
  /** Set when this is a repayment income linked to a shared expense. */
  splitExpenseId?: string;
}

// ---- Budgets ----------------------------------------------------------------

export interface Budget {
  id: string;
  categoryId: string;
  monthlyLimit: number;
  accountId?: string;
  currency?: string;
  createdAt: string;
}

// ---- Recurring Rules --------------------------------------------------------

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type IntervalUnit = 'day' | 'week' | 'month' | 'year';

export interface RecurringRule {
  id: string;
  type: Exclude<TransactionType, 'transfer'>;
  amount: number;
  accountId: string;
  categoryId?: string;
  subcategoryId?: string;
  payee?: string;
  note?: string;
  frequency: RecurringFrequency;
  /** For 'custom' frequency. */
  intervalUnit?: IntervalUnit;
  intervalValue?: number;
  /** For 'weekly': 0=Sun, 1=Mon … 6=Sat. */
  dayOfWeek?: number;
  /** For 'monthly': 1–31, or -1 for last day of month. */
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
  /** ISO date string of the next occurrence. Updated after each processing run. */
  nextDue: string;
  /**
   * When false: creates a "pending" transaction that the user must confirm.
   * When true: creates the transaction silently on the due date.
   */
  autoCreate: boolean;
  /** Days before nextDue to send a reminder notification. */
  reminderDays: number;
  active: boolean;
  createdAt: string;
}

// ---- Shared / Split Expenses ------------------------------------------------

export type SplitStatus = 'pending' | 'partial' | 'paid';

export interface SplitParticipant {
  id: string;
  /** The original shared expense transaction ID. */
  transactionId: string;
  name: string;
  shareAmount: number;
  paidAmount: number;
  status: SplitStatus;
  note?: string;
  settledAt?: string;
  createdAt: string;
}

// ---- Settings / Presets / State ---------------------------------------------

export type NumberFormat = 'international' | 'indian';

export interface AppSettings {
  currency: string;
  numberFormat?: NumberFormat;
  hasOnboarded: boolean;
}

/**
 * A one-tap entry shown on the home screen widget. Tapping it writes the
 * transaction immediately, so every field needed to save one lives here.
 */
export interface QuickPreset {
  id: string;
  label: string;
  emoji: string;
  amount: number;
  type: Exclude<TransactionType, 'transfer'>;
  categoryId?: string;
  /** Falls back to the first non-archived account when unset. */
  accountId?: string;
}

export interface FinanceState {
  accounts: Account[];
  categories: Category[];
  /** Loaded from DB alongside categories; not part of JSON backup. */
  subcategories?: Subcategory[];
  transactions: Transaction[];
  budgets: Budget[];
  quickPresets: QuickPreset[];
  settings: AppSettings;
  isLoaded: boolean;
}

