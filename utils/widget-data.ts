/**
 * Pure data shapes and rules for the home screen widgets.
 *
 * Deliberately free of any `react-native`/`expo-sqlite` import — the widget
 * preset tests run under `tsx` in plain Node, which cannot transform the
 * Flow syntax `react-native`'s own entry point uses, so anything reachable
 * from here has to stay engine-agnostic. The actual I/O (`getDb()`) lives in
 * `utils/widget-data-io.ts`, mirroring the split `db/rollup-math.ts` (pure)
 * vs `db/client.ts` (I/O) already uses for the same reason.
 */

import { FinanceState, QuickPreset, Transaction } from '@/types/finance';
import { generateId } from '@/utils/id';

export interface WidgetAccountBalance {
  id: string;
  name: string;
  color: string;
  balance: number;
}

export interface WidgetSummary {
  currency: string;
  balance: number;
  spentThisMonth: number;
  presets: QuickPreset[];
  /** Non-archived accounts with a live balance, sorted highest first. */
  accounts: WidgetAccountBalance[];
  /** False before onboarding, when there is nothing meaningful to show. */
  ready: boolean;
}

/**
 * Builds the transaction a preset represents, or null when it cannot be saved.
 *
 * Pure so the rules stay testable: a preset is only valid if it has a positive
 * amount and resolves to an account that still exists. Only `accounts` and
 * `categories` are read — callers pass a minimal `FinanceState`-shaped object.
 */
export function buildPresetTransaction(
  state: Pick<FinanceState, 'accounts' | 'categories'>,
  preset: QuickPreset,
  now: Date = new Date()
): Transaction | null {
  if (!(preset.amount > 0)) return null;

  const live = state.accounts.filter(account => !account.archived);
  // A preset can outlive the account or category it was created against.
  const account = live.find(a => a.id === preset.accountId) ?? live[0];
  if (!account) return null;

  const categoryExists = state.categories.some(
    c => c.id === preset.categoryId && c.kind === preset.type
  );

  return {
    id: generateId(),
    type: preset.type,
    amount: preset.amount,
    accountId: account.id,
    categoryId: categoryExists ? preset.categoryId : undefined,
    date: now.toISOString(),
    note: preset.label,
    createdAt: now.toISOString(),
  };
}
