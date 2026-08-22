import { Account, AppSettings, Budget, Category, NumberFormat, QuickPreset } from '@/types/finance';

import { Db, AccountRow, CategoryRow, BudgetRow, QuickPresetRow } from './types';
import { monthKeysTouchingAccount } from './transactions';
import { rebuildRollups } from './rebuild';
import { bumpDataVersion } from './version';

/**
 * CRUD for the small, bounded entities — accounts, categories, budgets,
 * presets, settings. These stay fully loaded in memory (there are tens of
 * rows, never millions), so this module is a thin, synchronous-feeling
 * wrapper rather than a paged query layer.
 */

// ---- accounts ----

function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Account['type'],
    icon: row.icon as Account['icon'],
    color: row.color,
    initialBalance: row.initial_balance,
    createdAt: row.created_at,
    archived: row.archived === 1,
  };
}

export async function listAccounts(db: Db): Promise<Account[]> {
  const rows = await db.getAllAsync<AccountRow>(
    'SELECT * FROM accounts ORDER BY sort_order, created_at'
  );
  return rows.map(rowToAccount);
}

export async function insertAccount(db: Db, account: Account, sortOrder: number): Promise<void> {
  await db.runAsync(
    `INSERT INTO accounts (id, name, type, icon, color, initial_balance, created_at, archived, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      account.id,
      account.name,
      account.type,
      account.icon,
      account.color,
      account.initialBalance,
      account.createdAt,
      account.archived ? 1 : 0,
      sortOrder,
    ]
  );
  await db.runAsync('INSERT OR IGNORE INTO account_balance (account_id, delta) VALUES (?, 0)', [
    account.id,
  ]);
  bumpDataVersion();
}

export async function updateAccount(db: Db, account: Account): Promise<void> {
  await db.runAsync(
    `UPDATE accounts SET name = ?, type = ?, icon = ?, color = ?, initial_balance = ?, archived = ?
     WHERE id = ?`,
    [
      account.name,
      account.type,
      account.icon,
      account.color,
      account.initialBalance,
      account.archived ? 1 : 0,
      account.id,
    ]
  );
  bumpDataVersion();
}

/**
 * Deletes an account and every transaction that touches it (the schema's
 * `ON DELETE CASCADE` handles the row removal), then does a *scoped* rebuild
 * of just the affected month buckets rather than trying to reverse each
 * deleted transaction's rollup contribution individually — for an account
 * with a large history, reversing row-by-row is the expensive path; a
 * `GROUP BY` over the touched months is not.
 */
export async function deleteAccount(db: Db, accountId: string): Promise<void> {
  const months = await monthKeysTouchingAccount(db, accountId);
  await db.withTransaction(async txn => {
    await txn.runAsync('DELETE FROM accounts WHERE id = ?', [accountId]);
  });
  if (months.length > 0) {
    // A full rebuild is simplest and correct; scoping it to just the touched
    // months is a possible future optimization if this proves slow in
    // practice, but deletes are rare, destructive, already-confirmed actions.
    await rebuildRollups(db);
  }
  bumpDataVersion();
}

// ---- categories ----

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon as Category['icon'],
    color: row.color,
    kind: row.kind,
    isDefault: row.is_default === 1,
  };
}

export async function listCategories(db: Db): Promise<Category[]> {
  const rows = await db.getAllAsync<CategoryRow>(
    'SELECT * FROM categories ORDER BY sort_order, name'
  );
  return rows.map(rowToCategory);
}

export async function insertCategory(db: Db, category: Category, sortOrder: number): Promise<void> {
  await db.runAsync(
    `INSERT INTO categories (id, name, icon, color, kind, is_default, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [category.id, category.name, category.icon, category.color, category.kind, category.isDefault ? 1 : 0, sortOrder]
  );
  bumpDataVersion();
}

export async function updateCategory(db: Db, category: Category): Promise<void> {
  await db.runAsync('UPDATE categories SET name = ?, icon = ?, color = ? WHERE id = ?', [
    category.name,
    category.icon,
    category.color,
    category.id,
  ]);
  bumpDataVersion();
}

/**
 * Deletes a category. Transactions referencing it are not deleted — the
 * schema's `ON DELETE SET NULL` moves them to uncategorised, which merges
 * them into the rollup's existing "" category bucket. A scoped rebuild
 * reconciles that merge; see the comment on `deleteAccount` for why a rebuild
 * rather than per-row reversal.
 */
export async function deleteCategory(db: Db, categoryId: string): Promise<void> {
  const touched = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?',
    [categoryId]
  );
  await db.withTransaction(async txn => {
    await txn.runAsync('DELETE FROM categories WHERE id = ?', [categoryId]);
  });
  if ((touched?.n ?? 0) > 0) {
    await rebuildRollups(db);
  }
  bumpDataVersion();
}

// ---- budgets ----

function rowToBudget(row: BudgetRow): Budget {
  return {
    id: row.id,
    categoryId: row.category_id,
    monthlyLimit: row.monthly_limit,
    createdAt: row.created_at,
  };
}

export async function listBudgets(db: Db): Promise<Budget[]> {
  const rows = await db.getAllAsync<BudgetRow>('SELECT * FROM budgets ORDER BY sort_order, created_at');
  return rows.map(rowToBudget);
}

export async function insertBudget(db: Db, budget: Budget, sortOrder: number): Promise<void> {
  await db.runAsync(
    'INSERT INTO budgets (id, category_id, monthly_limit, created_at, sort_order) VALUES (?, ?, ?, ?, ?)',
    [budget.id, budget.categoryId, budget.monthlyLimit, budget.createdAt, sortOrder]
  );
  bumpDataVersion();
}

export async function updateBudget(db: Db, budget: Budget): Promise<void> {
  await db.runAsync('UPDATE budgets SET category_id = ?, monthly_limit = ? WHERE id = ?', [
    budget.categoryId,
    budget.monthlyLimit,
    budget.id,
  ]);
  bumpDataVersion();
}

export async function deleteBudget(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM budgets WHERE id = ?', [id]);
  bumpDataVersion();
}

// ---- quick presets ----

function rowToPreset(row: QuickPresetRow): QuickPreset {
  return {
    id: row.id,
    label: row.label,
    emoji: row.emoji,
    amount: row.amount,
    type: row.type,
    categoryId: row.category_id ?? undefined,
    accountId: row.account_id ?? undefined,
  };
}

export async function listPresets(db: Db): Promise<QuickPreset[]> {
  const rows = await db.getAllAsync<QuickPresetRow>(
    'SELECT * FROM quick_presets ORDER BY sort_order'
  );
  return rows.map(rowToPreset);
}

export async function insertPreset(db: Db, preset: QuickPreset, sortOrder: number): Promise<void> {
  await db.runAsync(
    `INSERT INTO quick_presets (id, label, emoji, amount, type, category_id, account_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      preset.id,
      preset.label,
      preset.emoji,
      preset.amount,
      preset.type,
      preset.categoryId ?? null,
      preset.accountId ?? null,
      sortOrder,
    ]
  );
  bumpDataVersion();
}

export async function updatePreset(db: Db, preset: QuickPreset): Promise<void> {
  await db.runAsync(
    `UPDATE quick_presets SET label = ?, emoji = ?, amount = ?, type = ?, category_id = ?, account_id = ?
     WHERE id = ?`,
    [preset.label, preset.emoji, preset.amount, preset.type, preset.categoryId ?? null, preset.accountId ?? null, preset.id]
  );
  bumpDataVersion();
}

export async function deletePreset(db: Db, id: string): Promise<void> {
  await db.runAsync('DELETE FROM quick_presets WHERE id = ?', [id]);
  bumpDataVersion();
}

// ---- settings ----

const SETTINGS_KEYS = ['currency', 'numberFormat', 'hasOnboarded'] as const;

export async function getSettings(db: Db): Promise<AppSettings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map = new Map(rows.map(r => [r.key, r.value]));
  return {
    currency: map.get('currency') ?? 'USD',
    numberFormat: (map.get('numberFormat') as NumberFormat | undefined) ?? undefined,
    hasOnboarded: map.get('hasOnboarded') === 'true',
  };
}

export async function updateSettings(db: Db, patch: Partial<AppSettings>): Promise<void> {
  await db.withTransaction(async txn => {
    for (const key of SETTINGS_KEYS) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (value === undefined) {
        await txn.runAsync('DELETE FROM settings WHERE key = ?', [key]);
      } else {
        await txn.runAsync(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [key, String(value)]
        );
      }
    }
  });
  bumpDataVersion();
}

// ---- account balances (used by Home, Accounts, the widget) ----

export interface AccountBalance {
  accountId: string;
  balance: number;
}

/** Every account's balance in one query — O(accounts), never per-account. */
export async function listAccountBalances(db: Db): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ id: string; initial_balance: number; delta: number | null }>(
    `SELECT a.id, a.initial_balance, b.delta
     FROM accounts a LEFT JOIN account_balance b ON b.account_id = a.id`
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.id, row.initial_balance + (row.delta ?? 0) / 100);
  }
  return map;
}

export async function getNetWorth(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(a.initial_balance + COALESCE(b.delta, 0) / 100.0), 0) AS total
     FROM accounts a LEFT JOIN account_balance b ON b.account_id = a.id
     WHERE a.archived = 0`
  );
  return row?.total ?? 0;
}

// ---- budget progress (Budgets screen) ----

export interface BudgetProgress {
  budget: Budget;
  category: Category | undefined;
  spent: number;
  percent: number;
  remaining: number;
}

/**
 * Category spend for one month, from the rollup rather than a scan — the
 * `expense` column at day grain, summed across that month's day buckets.
 * Day grain rather than month grain for the same reason `db/insights.ts`
 * dropped month grain entirely: cheap either way, and this sidesteps ever
 * having to reason about whether a given month is "complete" again.
 */
export async function getBudgetProgress(db: Db, monthKey: string): Promise<BudgetProgress[]> {
  const budgets = await listBudgets(db);
  const categories = await listCategories(db);
  const byId = new Map(categories.map(c => [c.id, c]));

  const rows = await db.getAllAsync<{ category_id: string; spent: number }>(
    `SELECT category_id, SUM(expense) AS spent FROM rollup
     WHERE grain = 'D' AND bucket LIKE ? AND category_id != ''
     GROUP BY category_id`,
    [`${monthKey}-%`]
  );
  const spendByCategory = new Map(rows.map(r => [r.category_id, (r.spent ?? 0) / 100]));

  return budgets.map(budget => {
    const spent = spendByCategory.get(budget.categoryId) ?? 0;
    return {
      budget,
      category: byId.get(budget.categoryId),
      spent,
      percent: budget.monthlyLimit > 0 ? Math.min(spent / budget.monthlyLimit, 1) : 0,
      remaining: budget.monthlyLimit - spent,
    };
  });
}

// ---- month summary (Home screen) ----

export interface MonthSummary {
  income: number;
  expense: number;
}

/** This month's income/expense, optionally scoped to one account, from the rollup. */
export async function getMonthSummary(db: Db, monthKey: string, accountId?: string | null): Promise<MonthSummary> {
  const clauses = ["grain = 'D'", 'bucket LIKE ?'];
  const params: (string | number)[] = [`${monthKey}-%`];
  if (accountId) {
    clauses.push('account_id = ?');
    params.push(accountId);
  }
  const row = await db.getFirstAsync<{ income: number; expense: number }>(
    `SELECT COALESCE(SUM(income), 0) AS income, COALESCE(SUM(expense), 0) AS expense
     FROM rollup WHERE ${clauses.join(' AND ')}`,
    params
  );
  return { income: (row?.income ?? 0) / 100, expense: (row?.expense ?? 0) / 100 };
}
