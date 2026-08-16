/**
 * File and share-sheet plumbing for data export/import.
 *
 * Split from `data-transfer.ts` so the validation rules there stay free of
 * native imports and can be tested without a device. The export is written to
 * the app's cache directory and handed to the system share sheet — nothing is
 * uploaded, and Mercury never learns where it ends up.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { PersistedFinanceState } from '@/storage/storage';
import {
  EXPORT_FORMAT_VERSION,
  ExportSummary,
  ImportResult,
  MercuryExport,
  parseExport,
  summarize,
} from '@/utils/data-transfer';

/* ------------------------------------------------------------------ export */

export type ExportResult =
  | { ok: true; fileName: string; summary: ExportSummary }
  | { ok: false; reason: string };

function exportFileName(now: Date): string {
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  return `mercury-backup-${stamp}.json`;
}

export async function exportData(
  data: PersistedFinanceState,
  appVersion?: string
): Promise<ExportResult> {
  try {
    const payload: MercuryExport = {
      format: 'mercury-finance-export',
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion,
      data,
    };

    const fileName = exportFileName(new Date());
    const file = new File(Paths.cache, fileName);
    // Re-exporting on the same day would otherwise hit an existing file.
    if (file.exists) file.delete();
    file.create();
    file.write(JSON.stringify(payload, null, 2));

    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'Sharing is not available on this device.' };
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export Mercury data',
      UTI: 'public.json',
    });

    return { ok: true, fileName, summary: summarize(data) };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Could not write the export file.',
    };
  }
}

/** Opens the system file picker and validates whatever comes back. */
export async function pickAndParseImport(): Promise<ImportResult> {
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
    return parseExport(await file.text());
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'Could not read that file.',
    };
  }
}

