/**
 * File and share-sheet plumbing for data export/import.
 *
 * `utils/data-transfer.ts` keeps the pure validation/merge rules (still
 * fully in-memory, tested with `npm run test:transfer`); `utils/
 * import-stream.ts` keeps the SQLite-facing streaming import logic, kept
 * free of any `react-native`-pulling import so it can be tested directly
 * with `tsx` — see that file's header. This file is the thin shell that
 * turns a real device `File` into the chunks/writer those two need, plus
 * the bits that only make sense with a real file: sharing the export, and
 * picking an import off the file system.
 *
 * Export streams straight from SQLite to the file via `iterateTransactions`
 * + a writable stream, never holding more than one row at a time. Import
 * runs in two passes over the same file: a preview pass validates and
 * counts without writing anything, so the UI can show a summary and ask
 * merge-vs-replace before committing; the apply pass re-reads it and writes
 * straight into SQLite in batches. Neither pass ever holds the whole
 * transactions array in memory.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { Db } from '@/db/types';
import { listAccounts, listCategories, listBudgets, listPresets, getSettings } from '@/db/entities';
import { iterateTransactions } from '@/db/transactions';
import { EXPORT_FORMAT_VERSION, ExportSummary } from '@/utils/data-transfer';
import {
  applyImportChunks,
  previewImportChunks,
  ApplyImportOptions,
  ImportMode,
  ImportPreview,
} from '@/utils/import-stream';

export type { ImportMode, ImportPreview } from '@/utils/import-stream';

/* ------------------------------------------------------------------ export */

export type ExportResult =
  | { ok: true; fileName: string; summary: ExportSummary }
  | { ok: false; reason: string }
  | { ok: false; cancelled: true; reason: string };

export interface ExportOptions {
  /** Called roughly every 200ms while streaming transactions, with the running count. */
  onProgress?: (written: number) => void;
  /** Checked periodically; returning true aborts the write — a partial backup is never shared. */
  shouldCancel?: () => boolean;
}

function exportFileName(now: Date): string {
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  return `mercury-backup-${stamp}.json`;
}

/** Streams one JSON value's text straight to the file, comma-prefixed after the first. */
function jsonField(key: string, value: unknown, first = false): string {
  return `${first ? '' : ','}"${key}":${JSON.stringify(value)}`;
}

export async function exportData(
  db: Db,
  appVersion?: string,
  options?: ExportOptions
): Promise<ExportResult> {
  try {
    const fileName = exportFileName(new Date());
    const file = new File(Paths.cache, fileName);
    if (file.exists) file.delete();
    file.create();

    const [accounts, categories, budgets, quickPresets, settings] = await Promise.all([
      listAccounts(db),
      listCategories(db),
      listBudgets(db),
      listPresets(db),
      getSettings(db),
    ]);

    const writer = file.writableStream().getWriter();
    const encoder = new TextEncoder();
    const put = (s: string) => writer.write(encoder.encode(s));

    let transactionCount = 0;
    let cancelled = false;
    let lastProgressAt = 0;
    try {
      await put('{');
      await put(jsonField('format', 'mercury-finance-export', true));
      await put(jsonField('version', EXPORT_FORMAT_VERSION));
      await put(jsonField('exportedAt', new Date().toISOString()));
      if (appVersion) await put(jsonField('appVersion', appVersion));
      await put(',"data":{');
      await put(jsonField('accounts', accounts, true));
      await put(jsonField('categories', categories));
      await put(jsonField('budgets', budgets));
      await put(jsonField('quickPresets', quickPresets));
      await put(jsonField('settings', settings));
      await put(',"transactions":[');
      let first = true;
      for await (const tx of iterateTransactions(db)) {
        await put((first ? '' : ',') + JSON.stringify(tx));
        first = false;
        transactionCount++;

        // Throttled the same way fill-test-data.tsx throttles its own
        // progress UI — every row would mean a setState per row on the
        // caller's end for no visible benefit.
        const now = Date.now();
        if (now - lastProgressAt > 200) {
          lastProgressAt = now;
          options?.onProgress?.(transactionCount);
          if (options?.shouldCancel?.()) {
            cancelled = true;
            break;
          }
        }
      }
      await put(']}}');
    } finally {
      await writer.close();
    }

    if (cancelled) {
      if (file.exists) file.delete();
      return { ok: false, cancelled: true, reason: 'Export cancelled.' };
    }

    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'Sharing is not available on this device.' };
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export Mercury data',
      UTI: 'public.json',
    });

    return {
      ok: true,
      fileName,
      summary: {
        accounts: accounts.length,
        categories: categories.length,
        budgets: budgets.length,
        presets: quickPresets.length,
        transactions: transactionCount,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Could not write the export file.',
    };
  }
}

/* ------------------------------------------------------------------ import */

/** Decodes a file's bytes into text chunks, streamed — never the whole file as one string. */
async function* readFileAsTextChunks(file: File): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = file.readableStream().getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

export type PickImportResult =
  | { ok: true; file: File; preview: ImportPreview }
  | { ok: false; reason: string }
  | { ok: false; cancelled: true; reason: string };

/** Opens the system file picker and previews whatever comes back. */
export async function pickAndPreviewImport(): Promise<PickImportResult> {
  try {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (picked.canceled || !picked.assets?.length) {
      return { ok: false, cancelled: true, reason: 'Import cancelled.' };
    }

    const file = new File(picked.assets[0].uri);
    const outcome = await previewImportChunks(readFileAsTextChunks(file));
    if (!outcome.ok) return outcome;
    return { ok: true, file, preview: outcome.preview };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Could not read that file.',
    };
  }
}

/**
 * Commits a previewed import: re-reads the same file (a second sequential
 * pass, cheap next to holding it all in memory) and writes it into SQLite —
 * see `utils/import-stream.ts#applyImportChunks` for the actual logic.
 */
export async function applyImport(
  db: Db,
  file: File,
  mode: ImportMode,
  options?: ApplyImportOptions
): Promise<{ cancelled: boolean }> {
  return applyImportChunks(db, readFileAsTextChunks(file), mode, options);
}
