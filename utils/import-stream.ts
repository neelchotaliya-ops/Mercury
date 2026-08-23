/**
 * The database-facing half of streaming import: given a Mercury export as
 * text chunks (from a file, or a plain string in a test), preview it
 * without writing anything, or apply it straight into SQLite.
 *
 * Deliberately free of any `expo-file-system`/`expo-sharing` import — those
 * pull in `react-native`, which breaks under the `tsx` runner the same way
 * `db/client.ts` does (see that file's header, and `utils/widget-data.ts`'s
 * for the same split applied there). `utils/data-transfer-io.ts` is the
 * thin file-I/O shell around this: it turns a picked `File` into chunks and
 * calls straight through.
 */

import { AppSettings, Account, Budget, Category, QuickPreset } from '@/types/finance';
import { Db } from '@/db/types';
import {
  listAccounts,
  listCategories,
  listBudgets,
  listPresets,
  insertAccountRow,
  insertCategoryRow,
  insertBudgetRow,
  insertPresetRow,
  updateSettings,
} from '@/db/entities';
import { bulkInsertTransactionRows } from '@/db/transactions';
import { rebuildRollups } from '@/db/rebuild';
import { bumpDataVersion } from '@/db/version';
import { dropBulkIndexes, ensureBulkIndexes } from '@/db/schema';
import {
  EXPORT_FORMAT_VERSION,
  ExportSummary,
  isRecord,
  parseAccounts,
  parseCategories,
  parseBudgets,
  parsePresets,
  parseTransactionItem,
} from '@/utils/data-transfer';
import { readMercuryExport } from '@/utils/json-stream';
import { readMercuryExportCsv } from '@/utils/csv-stream';

export interface ImportPreview {
  summary: ExportSummary;
  accounts: Account[];
  categories: Category[];
  budgets: Budget[];
  quickPresets: QuickPreset[];
  settings: AppSettings;
}

export type PreviewOutcome = { ok: true; preview: ImportPreview } | { ok: false; reason: string };

/**
 * Both formats carry the same meta shape and the same per-transaction
 * validation (`parseTransactionItem` runs unchanged either way) — only how
 * raw text becomes "meta + a stream of raw transaction records" differs.
 * `readMercuryExport`/`readMercuryExportCsv` share the exact same signature
 * for this reason, so `previewImportChunks`/`applyImportChunks` below don't
 * need a format-specific branch anywhere except picking which one to call.
 */
export type ImportFormat = 'json' | 'csv';

function readerFor(format: ImportFormat) {
  return format === 'csv' ? readMercuryExportCsv : readMercuryExport;
}

function coerceSettings(raw: unknown): AppSettings {
  const settings = isRecord(raw) ? raw : {};
  const currency = typeof settings.currency === 'string' ? settings.currency : 'INR';
  const numberFormat =
    settings.numberFormat === 'indian' || settings.numberFormat === 'international'
      ? settings.numberFormat
      : undefined;
  const hasOnboarded = typeof settings.hasOnboarded === 'boolean' ? settings.hasOnboarded : true;
  return { currency, numberFormat, hasOnboarded };
}

/**
 * Reads a Mercury export once end to end, validating and counting without
 * writing anything — what lets Settings show "this backup has N
 * transactions" before the user commits to merge or replace.
 */
export async function previewImportChunks(
  chunks: AsyncIterable<string>,
  format: ImportFormat = 'json'
): Promise<PreviewOutcome> {
  try {
    let accountIds: Set<string> | undefined;
    let validAccounts: Account[] = [];
    let transactionCount = 0;

    const meta = await readerFor(format)(chunks, (raw, metaSoFar) => {
      if (accountIds === undefined) {
        if (metaSoFar.format !== 'mercury-finance-export') {
          throw new Error('That file was not exported from Mercury.');
        }
        const version = typeof metaSoFar.version === 'number' ? metaSoFar.version : 0;
        if (version > EXPORT_FORMAT_VERSION) {
          throw new Error('That backup was made by a newer version of Mercury. Update the app and try again.');
        }
        validAccounts = parseAccounts(metaSoFar.accounts);
        if (validAccounts.length === 0) {
          throw new Error('That backup contains no usable accounts.');
        }
        accountIds = new Set(validAccounts.map(a => a.id));
      }
      if (parseTransactionItem(raw, accountIds)) transactionCount++;
    });

    // A backup with zero transactions never invokes the callback above, so
    // the same checks run again here — the only way to catch a bad format
    // or missing accounts on an otherwise well-formed, empty backup.
    if (meta.format !== 'mercury-finance-export') {
      return { ok: false, reason: 'That file was not exported from Mercury.' };
    }
    const version = typeof meta.version === 'number' ? meta.version : 0;
    if (version > EXPORT_FORMAT_VERSION) {
      return {
        ok: false,
        reason: 'That backup was made by a newer version of Mercury. Update the app and try again.',
      };
    }
    const accounts = validAccounts.length > 0 ? validAccounts : parseAccounts(meta.accounts);
    if (accounts.length === 0) {
      return { ok: false, reason: 'That backup contains no usable accounts.' };
    }

    const categories = parseCategories(meta.categories);
    const budgets = parseBudgets(meta.budgets);
    const quickPresets = parsePresets(meta.quickPresets);
    const settings = coerceSettings(meta.settings);

    return {
      ok: true,
      preview: {
        summary: {
          accounts: accounts.length,
          categories: categories.length,
          budgets: budgets.length,
          presets: quickPresets.length,
          transactions: transactionCount,
        },
        accounts,
        categories,
        budgets,
        quickPresets,
        settings,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "That file isn't a valid Mercury backup.",
    };
  }
}

export type ImportMode = 'merge' | 'replace';

const TRANSACTION_BATCH_SIZE = 500;

/** Thrown from inside the parse loop to unwind cleanly on cancellation — caught below, never surfaced as a real error. */
class ImportCancelledError extends Error {}

export interface ApplyImportOptions {
  /** Called after each committed batch, with the running insert count and (if known, from the preview pass) the total. */
  onProgress?: (inserted: number, total?: number) => void;
  /** Checked after each batch; returning true stops the run — already-applied rows are kept, same contract as `seedScaleData`. */
  shouldCancel?: () => boolean;
  /** The preview pass's transaction count, if available, forwarded to `onProgress` as the total. */
  total?: number;
  /** Defaults to 'json'. Must match whatever `previewImportChunks` was called with for the same file. */
  format?: ImportFormat;
}

/**
 * Commits an import to SQLite: reads the export as chunks and writes
 * straight through, batching transactions and rebuilding the rollup tables
 * once at the end rather than incrementally per row.
 *
 * `replace` wipes the ledger and every small entity table first, so what
 * lands is exactly the backup's contents. `merge` keeps what's already
 * there: small entities are added only if their id doesn't already exist
 * (matching the old in-memory `mergeById` semantics exactly), and
 * transactions go in via `INSERT OR IGNORE`, so importing the same backup
 * twice — merge or replace — is a no-op the second time.
 */
export async function applyImportChunks(
  db: Db,
  chunks: AsyncIterable<string>,
  mode: ImportMode,
  options?: ApplyImportOptions
): Promise<{ cancelled: boolean }> {
  if (mode === 'replace') {
    await db.withTransaction(async txn => {
      await txn.execAsync(
        'DELETE FROM transactions; DELETE FROM accounts; DELETE FROM categories; DELETE FROM budgets; DELETE FROM quick_presets; DELETE FROM rollup; DELETE FROM account_balance;'
      );
    });
  }

  const [existingAccounts, existingCategories, existingBudgets, existingPresets] = await Promise.all([
    listAccounts(db),
    listCategories(db),
    listBudgets(db),
    listPresets(db),
  ]);
  const seenAccountIds = new Set(existingAccounts.map(a => a.id));
  const seenCategoryIds = new Set(existingCategories.map(c => c.id));
  const seenBudgetIds = new Set(existingBudgets.map(b => b.id));
  const seenPresetIds = new Set(existingPresets.map(p => p.id));

  let accountSortOrder = existingAccounts.length;
  let categorySortOrder = existingCategories.length;
  let budgetSortOrder = existingBudgets.length;
  let presetSortOrder = existingPresets.length;

  // The valid account id set transactions are checked against — starts as
  // whatever already exists, and is widened once the incoming accounts
  // (always read before "transactions" in the file) have been merged in.
  let accountIds = new Set(seenAccountIds);
  let smallEntitiesApplied = false;

  /**
   * Merges accounts/categories/budgets/presets by id (skip if already
   * present — the same rule `mergeById` used to apply in JS, now applied at
   * the SQL layer) and, for `replace`, adopts the backup's settings. Called
   * once, either on the first transaction seen or, if the backup has none,
   * after the file has been fully read.
   *
   * Runs after `dropBulkIndexes` below, so this uses the *Row (no
   * `bumpDataVersion`) insert variants — a bump here would risk waking a
   * mounted screen's query hook into a read against `transactions` while
   * its indexes are still down, which is exactly what produces SQLite's
   * "database table is locked". One bump at the very end, once the indexes
   * are back, is both correct and safe.
   */
  async function applySmallEntities(metaSoFar: Record<string, unknown>): Promise<void> {
    if (smallEntitiesApplied) return;
    smallEntitiesApplied = true;

    for (const a of parseAccounts(metaSoFar.accounts)) {
      if (seenAccountIds.has(a.id)) continue;
      await insertAccountRow(db, a, accountSortOrder++);
      seenAccountIds.add(a.id);
    }
    accountIds = new Set(seenAccountIds);

    for (const c of parseCategories(metaSoFar.categories)) {
      if (seenCategoryIds.has(c.id)) continue;
      await insertCategoryRow(db, c, categorySortOrder++);
      seenCategoryIds.add(c.id);
    }
    for (const b of parseBudgets(metaSoFar.budgets)) {
      if (seenBudgetIds.has(b.id)) continue;
      await insertBudgetRow(db, b, budgetSortOrder++);
      seenBudgetIds.add(b.id);
    }
    for (const p of parsePresets(metaSoFar.quickPresets)) {
      if (seenPresetIds.has(p.id)) continue;
      await insertPresetRow(db, p, presetSortOrder++);
      seenPresetIds.add(p.id);
    }
    // Merge keeps whatever settings are already there — only a full replace
    // adopts the backup's, matching the old `mergeData`'s `settings: current.settings`.
    // updateSettings still bumps on its own — it's a single call, not a
    // loop, so it isn't the per-row hazard the inserts above are, and
    // settings changing mid-load is not itself unsafe.
    if (mode === 'replace') {
      await updateSettings(db, coerceSettings(metaSoFar.settings));
    }
  }

  let inserted = 0;
  let pending: ReturnType<typeof parseTransactionItem>[] = [];
  const flush = async () => {
    if (pending.length === 0) return;
    const batch = pending.filter((t): t is NonNullable<typeof t> => t !== null);
    pending = [];
    if (batch.length > 0) {
      await bulkInsertTransactionRows(db, batch);
      inserted += batch.length;
      options?.onProgress?.(inserted, options.total);
      // Yield to the JS event loop between batches, same reason
      // db/seed-scale.ts does — keeps the UI (progress bar, a Cancel tap)
      // responsive across an import that can take a while, and is what
      // makes shouldCancel actually get observed in time below.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  };

  // Dropped for the load and rebuilt once at the end — see
  // db/schema.ts#dropBulkIndexes. A large import pays the same per-row
  // index-maintenance cost a bulk seed does.
  await dropBulkIndexes(db);
  let cancelled = false;
  try {
    const meta = await readerFor(options?.format ?? 'json')(chunks, async (raw, metaSoFar) => {
      await applySmallEntities(metaSoFar);
      pending.push(parseTransactionItem(raw, accountIds));
      if (pending.length >= TRANSACTION_BATCH_SIZE) {
        await flush();
        // Checked once per committed batch, not per row — same cadence
        // db/seed-scale.ts checks shouldCancel at, so "cancelled" always
        // means "everything up to a batch boundary landed", never a
        // half-written batch.
        if (options?.shouldCancel?.()) throw new ImportCancelledError();
      }
    });

    await applySmallEntities(meta); // no-op unless the backup had zero transactions
    await flush();
  } catch (error) {
    if (error instanceof ImportCancelledError) {
      cancelled = true;
    } else {
      throw error;
    }
  } finally {
    await ensureBulkIndexes(db);
  }

  // Rebuild regardless of cancellation — whatever got applied should still
  // read correctly rather than leaving the aggregate tables partially stale.
  await rebuildRollups(db);
  bumpDataVersion();
  return { cancelled };
}
