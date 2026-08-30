/**
 * The database surface the rest of the app is allowed to know about.
 *
 * This is a structural *subset* of expo-sqlite's `SQLiteDatabase`, so the real
 * handle satisfies it with no adapter. Everything else under `db/` takes a
 * `Db` as its first argument and imports nothing from `expo-sqlite`, which is
 * what lets the same SQL run under Node's built-in `node:sqlite` in tests —
 * no device, no emulator, no new dependency.
 *
 * It mirrors the pure/IO split the codebase already uses for
 * `utils/data-transfer.ts` vs `utils/data-transfer-io.ts`, for the same reason
 * and with the same payoff: the logic worth testing is reachable from a plain
 * `tsx` script.
 */
export interface SqlRunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface Db {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: SqlParams): Promise<SqlRunResult>;
  getFirstAsync<T>(source: string, params?: SqlParams): Promise<T | null>;
  getAllAsync<T>(source: string, params?: SqlParams): Promise<T[]>;
  getEachAsync<T>(source: string, params?: SqlParams): AsyncIterableIterator<T>;
  /**
   * Runs `task` inside a transaction.
   *
   * Named without the `Exclusive` of expo-sqlite's native-only variant because
   * the two platforms need different underlying calls: native uses
   * `withExclusiveTransactionAsync` (the Android widget opens a second
   * connection to the same file, so writes must serialise), while web only has
   * `withTransactionAsync` — and needs nothing stronger, since there is no
   * widget and no second process there. `db/client.ts` picks per platform.
   */
  withTransaction(task: (txn: Db) => Promise<void>): Promise<void>;
}

export type SqlParam = string | number | null;
export type SqlParams = SqlParam[];

/** Row shapes as they come back from SQL — snake_case, no nested objects. */
export interface TransactionRow {
  seq: number;
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  account_id: string;
  to_account_id: string | null;
  category_id: string | null;
  date: string;
  date_ms: number;
  month_key: string;
  day_key: string;
  note: string | null;
  note_lc: string | null;
  created_at: string;
  // v3 additions (nullable on pre-migration rows)
  payee: string | null;
  subcategory_id: string | null;
  // v4 addition
  recurring_rule_id: string | null;
  // v5 addition
  split_expense_id: string | null;
  // Derived split aggregations
  split_count?: number | null;
  split_pending_count?: number | null;
  split_owed_amount?: number | null;
  split_paid_amount?: number | null;
  split_original_payee?: string | null;
  split_original_note?: string | null;
  split_original_category_id?: string | null;
  split_original_category_name?: string | null;
  split_original_amount?: number | null;
}

export interface AccountRow {
  id: string;
  name: string;
  type: string;
  icon: string;
  color: string;
  initial_balance: number;
  currency?: string | null;
  created_at: string;
  archived: number;
  sort_order: number;
}

export interface CategoryRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  kind: 'income' | 'expense';
  is_default: number;
  sort_order: number;
}

export interface SubcategoryRow {
  id: string;
  category_id: string;
  name: string;
  icon: string;
  color: string;
  is_default: number;
  sort_order: number;
}

export interface BudgetRow {
  id: string;
  category_id: string;
  monthly_limit: number;
  account_id?: string | null;
  currency?: string | null;
  created_at: string;
  sort_order: number;
}

export interface QuickPresetRow {
  id: string;
  label: string;
  emoji: string;
  amount: number;
  type: 'income' | 'expense';
  category_id: string | null;
  account_id: string | null;
  sort_order: number;
}

export interface RecurringRuleRow {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  account_id: string;
  category_id: string | null;
  subcategory_id: string | null;
  payee: string | null;
  note: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  interval_unit: string | null;
  interval_value: number | null;
  day_of_week: number | null;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  next_due: string;
  auto_create: number;
  reminder_days: number;
  active: number;
  created_at: string;
}

export interface SplitParticipantRow {
  id: string;
  transaction_id: string;
  name: string;
  share_amount: number;
  paid_amount: number;
  status: 'pending' | 'partial' | 'paid';
  note: string | null;
  settled_at: string | null;
  created_at: string;
}

