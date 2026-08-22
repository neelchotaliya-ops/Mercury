import { dayKeyOf, monthKeyOf } from '@/utils/date';
import { NumberFormat } from '@/types/finance';
import {
  isRecord,
  parseAccounts,
  parseCategories,
  parseTransactions,
  parseBudgets,
  parsePresets,
} from '@/utils/data-transfer';

import { Db } from './types';
import { getMeta, setMeta } from './schema';
import { insertAccount, insertCategory, insertBudget, insertPreset, updateSettings } from './entities';
import { rebuildRollups } from './rebuild';

/**
 * One-time migration from the old single-key AsyncStorage JSON blob into
 * SQLite.
 *
 * The pure/IO split this codebase already uses elsewhere applies here too:
 * this function takes the raw blob text (or null for "no blob exists") and a
 * `Db`, and touches nothing outside the database — no `AsyncStorage` import,
 * so it runs under `node:sqlite` in tests. The caller (a React-adjacent
 * bootstrap module, not this file) is responsible for reading the
 * AsyncStorage key, and for renaming/removing it only after this returns a
 * successful status.
 *
 * Record-level validation reuses the exact drop-invalid-record rules from
 * `utils/data-transfer.ts` (the import-a-backup path) rather than
 * reimplementing them — a transaction pointing at a missing account, for
 * instance, is dropped there and dropped here for the same reason.
 */

export type BlobMigrationStatus = 'already-done' | 'empty' | 'migrated' | 'failed';

export interface BlobMigrationResult {
  status: BlobMigrationStatus;
  imported?: { accounts: number; categories: number; transactions: number; budgets: number; presets: number };
  droppedTransactions?: number;
  error?: string;
}

const STATE_KEY = 'blob_migration_state';

export async function migrateBlobIntoDb(db: Db, rawBlob: string | null): Promise<BlobMigrationResult> {
  const already = await getMeta(db, STATE_KEY);
  if (already === 'done') return { status: 'already-done' };

  if (rawBlob === null) {
    // Fresh install: nothing to import, but still marked done so this check
    // is O(1) on every subsequent launch instead of re-probing AsyncStorage.
    await setMeta(db, STATE_KEY, 'done');
    return { status: 'empty' };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBlob);
  } catch (e) {
    // Never destroy the source blob on a parse failure — the caller keeps it
    // untouched, quarantines a copy, and the app starts on an empty database
    // rather than losing data it couldn't yet interpret.
    await setMeta(db, STATE_KEY, 'failed');
    await setMeta(db, 'blob_migration_error', e instanceof Error ? e.message : String(e));
    return { status: 'failed', error: 'not valid JSON' };
  }

  if (!isRecord(decoded)) {
    await setMeta(db, STATE_KEY, 'failed');
    await setMeta(db, 'blob_migration_error', 'top-level value is not an object');
    return { status: 'failed', error: 'top-level value is not an object' };
  }

  const accounts = parseAccounts(decoded.accounts);
  // Fresh installs (buildFreshInstallState) legitimately have zero accounts
  // yet still carry seeded categories/presets — zero accounts is not itself
  // a failure condition here the way it is for a hand-provided backup file.
  const accountIds = new Set(accounts.map(a => a.id));
  const categories = parseCategories(decoded.categories);
  const transactions = parseTransactions(decoded.transactions, accountIds);
  const budgets = parseBudgets(decoded.budgets);
  const presets = parsePresets(decoded.quickPresets);
  const settingsRaw = isRecord(decoded.settings) ? decoded.settings : {};

  const rawTransactionCount = Array.isArray(decoded.transactions) ? decoded.transactions.length : 0;
  const droppedTransactions = rawTransactionCount - transactions.length;

  await db.withTransaction(async txn => {
    for (let i = 0; i < accounts.length; i++) await insertAccount(txn, accounts[i], i);
    for (let i = 0; i < categories.length; i++) await insertCategory(txn, categories[i], i);
    for (let i = 0; i < budgets.length; i++) await insertBudget(txn, budgets[i], i);
    for (let i = 0; i < presets.length; i++) await insertPreset(txn, presets[i], i);

    const currency = typeof settingsRaw.currency === 'string' ? settingsRaw.currency : 'INR';
    const numberFormat =
      settingsRaw.numberFormat === 'indian' || settingsRaw.numberFormat === 'international'
        ? (settingsRaw.numberFormat as NumberFormat)
        : undefined;
    await updateSettings(txn, {
      currency,
      numberFormat,
      hasOnboarded: settingsRaw.hasOnboarded === true,
    });

    // Bulk insert, not the per-row `insertTransaction` helper: that applies a
    // rollup/balance/stat delta per call, which is roughly two orders of
    // magnitude slower than one set-based rebuild for a historical import
    // (measured at ~1.3s/1M rows for the rebuild path during design). Every
    // row still gets its aggregate contribution — just computed once, after
    // the bulk load, via `rebuildRollups` below.
    for (const tx of transactions) {
      const dateMs = Date.parse(tx.date);
      await txn.runAsync(
        `INSERT OR IGNORE INTO transactions
           (id, type, amount, account_id, to_account_id, category_id, date, date_ms, month_key, day_key, note, note_lc, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tx.id,
          tx.type,
          tx.amount,
          tx.accountId,
          tx.toAccountId ?? null,
          tx.categoryId ?? null,
          tx.date,
          dateMs,
          monthKeyOf(tx.date),
          dayKeyOf(tx.date),
          tx.note ?? null,
          tx.note ? tx.note.toLowerCase() : null,
          tx.createdAt,
        ]
      );
    }
  });

  // Outside the import transaction: rebuildRollups drives its own, and
  // nesting BEGIN EXCLUSIVE inside BEGIN EXCLUSIVE is not something to rely
  // on across both the native and web backends.
  await rebuildRollups(db);

  await setMeta(db, STATE_KEY, 'done');

  return {
    status: 'migrated',
    imported: {
      accounts: accounts.length,
      categories: categories.length,
      transactions: transactions.length,
      budgets: budgets.length,
      presets: presets.length,
    },
    droppedTransactions,
  };
}
