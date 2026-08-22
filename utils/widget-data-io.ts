/**
 * I/O for the home screen widgets.
 *
 * Widget rendering and clicks run in a headless JS task — no React tree, no
 * FinanceProvider — so this module talks to SQLite directly through
 * `db/client.ts#getDb()`, exactly like the app's own screens. That module is
 * built for this: its `busy_timeout` PRAGMA exists specifically so a widget
 * tap and an app write, each holding their own connection to the same file,
 * serialise instead of clobbering each other.
 *
 * Split from `utils/widget-data.ts` so the pure rules there stay importable
 * from a plain-Node test script — see that file's header for why.
 */

import { QuickPreset, Transaction } from '@/types/finance';
import { getDb } from '@/db/client';
import { Db } from '@/db/types';
import {
  listAccounts,
  listCategories,
  listAccountBalances,
  getNetWorth,
  listPresets,
  getSettings,
  getMonthSummary,
} from '@/db/entities';
import { insertTransaction } from '@/db/transactions';
import { toMonthKey } from '@/utils/date';
import { buildPresetTransaction, WidgetSummary } from '@/utils/widget-data';

export type { WidgetAccountBalance, WidgetSummary } from '@/utils/widget-data';

async function buildSummary(db: Db): Promise<WidgetSummary> {
  const [accounts, balances, netWorth, presets, settings, monthSummary] = await Promise.all([
    listAccounts(db),
    listAccountBalances(db),
    getNetWorth(db),
    listPresets(db),
    getSettings(db),
    getMonthSummary(db, toMonthKey(new Date())),
  ]);

  const liveAccounts = accounts
    .filter(account => !account.archived)
    .map(account => ({
      id: account.id,
      name: account.name,
      color: account.color,
      balance: balances.get(account.id) ?? account.initialBalance,
    }))
    .sort((a, b) => b.balance - a.balance);

  return {
    currency: settings.currency,
    balance: netWorth,
    spentThisMonth: monthSummary.expense,
    presets,
    accounts: liveAccounts,
    ready: settings.hasOnboarded,
  };
}

/** Numbers the widget renders. Safe to call before any data exists. */
export async function getWidgetSummary(): Promise<WidgetSummary> {
  const db = await getDb();
  return buildSummary(db);
}

export type LogPresetResult =
  | { ok: true; transaction: Transaction; summary: WidgetSummary }
  | { ok: false; reason: 'unknown-preset' | 'invalid' };

/**
 * Writes the transaction for a preset straight to SQLite, going through the
 * same `insertTransaction` the app uses — the rollup/account_balance/
 * ledger_stat tables stay correct with no special-case widget path. This is
 * what makes the widget's one-tap logging work without ever opening the app.
 */
export async function logPreset(presetId: string): Promise<LogPresetResult> {
  const db = await getDb();

  const [accounts, categories, presets] = await Promise.all([
    listAccounts(db),
    listCategories(db),
    listPresets(db),
  ]);
  const preset = presets.find(p => p.id === presetId);
  if (!preset) return { ok: false, reason: 'unknown-preset' };

  const transaction = buildPresetTransaction({ accounts, categories }, preset);
  if (!transaction) return { ok: false, reason: 'invalid' };

  await insertTransaction(db, transaction);

  return { ok: true, transaction, summary: await buildSummary(db) };
}
