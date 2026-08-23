/**
 * Bank statement import — DB layer.
 *
 * Handles:
 * 1. Fuzzy duplicate detection against existing transactions
 * 2. Bulk insert of parsed bank rows using the same fast-path as the existing
 *    import pipeline (dropBulkIndexes / ensureBulkIndexes / bulkInsertTransactionRows)
 *
 * The actual CSV parsing lives in utils/bank-statement.ts (pure, no DB).
 */

import { ParsedBankTransaction } from '@/utils/bank-statement';
import { generateId } from '@/utils/id';
import { dayKeyOf, monthKeyOf } from '@/utils/date';

import { Db } from './types';
import { bumpDataVersion } from './version';

// ---- Duplicate detection ---------------------------------------------------

export interface DuplicateCheckResult {
  /** fingerprint → true when likely duplicate */
  duplicates: Map<string, boolean>;
  checkedCount: number;
}

/**
 * Performs fuzzy duplicate detection against existing transactions.
 *
 * For each parsed row, checks whether a transaction exists with:
 * - The same date (exact)
 * - Amount within ±0.50 of the row's amount
 * - The same direction (income/expense)
 *
 * This is intentionally conservative — a false positive is less disruptive
 * than silently importing a duplicate. The UI lets users override by
 * deselecting flagged rows.
 *
 * Uses a bounded index scan per row rather than a full-table scan, so cost
 * is O(rows × index_depth), not O(rows × transactions).
 */
export async function detectDuplicates(
  db: Db,
  rows: ParsedBankTransaction[]
): Promise<DuplicateCheckResult> {
  const duplicates = new Map<string, boolean>();

  for (const row of rows) {
    const dateMs = new Date(row.date).getTime();
    const type = row.direction;

    // Query: same date ± 0 days, amount within ±0.50, same type
    const match = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM transactions
       WHERE type = ?
         AND date_ms >= ? AND date_ms <= ?
         AND amount >= ? AND amount <= ?
       LIMIT 1`,
      [
        type,
        dateMs, dateMs + 86_399_999, // same calendar day
        row.amount - 0.50, row.amount + 0.50,
      ]
    );

    if (match) {
      duplicates.set(row.fingerprint, true);
    }
  }

  return { duplicates, checkedCount: rows.length };
}

// ---- Bulk insert -----------------------------------------------------------

export interface BankImportOptions {
  /** Account to assign all imported transactions to. */
  accountId: string;
  /** Default category for uncategorized rows (null = leave uncategorized). */
  defaultCategoryId?: string;
  /** Skip rows whose fingerprint is in this set. */
  skipFingerprints?: Set<string>;
  /** Progress callback — called with (imported, total) after each batch. */
  onProgress?: (imported: number, total: number) => void;
  batchSize?: number;
}

export interface BankImportResult {
  imported: number;
  skipped: number;
  errors: number;
}

/**
 * Bulk-inserts parsed bank rows into the transactions table.
 *
 * Uses the same dropBulkIndexes / INSERT / ensureBulkIndexes pattern as the
 * existing import pipeline for large statement files (500+ rows). For small
 * files (< 50 rows) the index round-trip overhead exceeds the gain, so those
 * go straight through.
 *
 * Unlike the main import pipeline, bank rows are always new transactions —
 * no update or delete logic is needed.
 */
export async function applyBankImport(
  db: Db,
  rows: ParsedBankTransaction[],
  opts: BankImportOptions
): Promise<BankImportResult> {
  const {
    accountId,
    defaultCategoryId = null,
    skipFingerprints = new Set(),
    onProgress,
    batchSize = 100,
  } = opts;

  const toImport = rows.filter(r => !skipFingerprints.has(r.fingerprint));
  let imported = 0;
  let errors = 0;

  // For large imports, drop secondary indices first (matches pattern in import-stream.ts)
  const useFastPath = toImport.length >= 50;
  if (useFastPath) {
    try {
      await db.execAsync(`
        DROP INDEX IF EXISTS idx_tx_note_lc;
        DROP INDEX IF EXISTS idx_tx_category;
        DROP INDEX IF EXISTS idx_tx_account;
        DROP INDEX IF EXISTS idx_tx_payee;
        DROP INDEX IF EXISTS idx_tx_subcat;
        DROP INDEX IF EXISTS idx_tx_recurring;
        DROP INDEX IF EXISTS idx_tx_split_ref;
      `);
    } catch {
      // Index may not exist on older schemas — continue
    }
  }

  try {
    for (let i = 0; i < toImport.length; i += batchSize) {
      const batch = toImport.slice(i, i + batchSize);

      await db.withTransaction(async txn => {
        for (const row of batch) {
          try {
            const id = generateId();
            const note = row.description.slice(0, 200); // truncate long bank narrations
            const dateMs = new Date(row.date).getTime();

            await txn.runAsync(
              `INSERT INTO transactions
                 (id, type, amount, account_id, to_account_id, category_id,
                  payee, note, date, date_ms, month_key, day_key, note_lc, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [
                id, row.direction, row.amount, accountId,
                null, defaultCategoryId,
                null,
                note, row.date, dateMs,
                monthKeyOf(row.date), dayKeyOf(row.date),
                note.toLowerCase(),
                new Date().toISOString(),
              ]
            );

            // Update rollup for this transaction
            // Rollup grain 'M' (monthly)
            await txn.runAsync(
              `INSERT INTO rollup (grain, bucket, account_id, category_id, income, expenses, count)
               VALUES ('M', ?, ?, ?, ?, ?, 1)
               ON CONFLICT (grain, bucket, account_id, category_id) DO UPDATE SET
                 income   = income   + excluded.income,
                 expenses = expenses + excluded.expenses,
                 count    = count    + 1`,
              [
                monthKeyOf(row.date), accountId, defaultCategoryId,
                row.direction === 'income' ? row.amount : 0,
                row.direction === 'expense' ? row.amount : 0,
              ]
            );
            // Rollup grain 'D' (daily)
            await txn.runAsync(
              `INSERT INTO rollup (grain, bucket, account_id, category_id, income, expenses, count)
               VALUES ('D', ?, ?, ?, ?, ?, 1)
               ON CONFLICT (grain, bucket, account_id, category_id) DO UPDATE SET
                 income   = income   + excluded.income,
                 expenses = expenses + excluded.expenses,
                 count    = count    + 1`,
              [
                dayKeyOf(row.date), accountId, defaultCategoryId,
                row.direction === 'income' ? row.amount : 0,
                row.direction === 'expense' ? row.amount : 0,
              ]
            );

            imported++;
          } catch {
            errors++;
          }
        }
      });

      onProgress?.(imported, toImport.length);
    }
  } finally {
    // Always restore indices even if the import was cancelled or errored
    if (useFastPath) {
      try {
        await db.execAsync(`
          CREATE INDEX IF NOT EXISTS idx_tx_note_lc   ON transactions(note_lc);
          CREATE INDEX IF NOT EXISTS idx_tx_category  ON transactions(category_id);
          CREATE INDEX IF NOT EXISTS idx_tx_account   ON transactions(account_id, date_ms DESC);
          CREATE INDEX IF NOT EXISTS idx_tx_payee     ON transactions(payee) WHERE payee IS NOT NULL;
          CREATE INDEX IF NOT EXISTS idx_tx_subcat    ON transactions(subcategory_id) WHERE subcategory_id IS NOT NULL;
          CREATE INDEX IF NOT EXISTS idx_tx_recurring ON transactions(recurring_rule_id) WHERE recurring_rule_id IS NOT NULL;
          CREATE INDEX IF NOT EXISTS idx_tx_split_ref ON transactions(split_expense_id) WHERE split_expense_id IS NOT NULL;
        `);
      } catch {
        // Best-effort restore
      }
    }
  }

  bumpDataVersion();

  return {
    imported,
    skipped: rows.length - toImport.length,
    errors,
  };
}

// ---- Preview ----------------------------------------------------------------

/**
 * Returns a preview of the first N rows from a parsed bank file, suitable
 * for the "Review" step of the import wizard. Does not write to the DB.
 */
export function previewBankRows(
  rows: ParsedBankTransaction[],
  count = 5
): ParsedBankTransaction[] {
  return rows.slice(0, count);
}
