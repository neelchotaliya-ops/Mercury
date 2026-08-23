/**
 * A minimal, streaming, RFC4180-ish CSV reader/writer, plus the Mercury
 * export wrapper format built on top of it.
 *
 * Reuses `utils/json-stream.ts`'s char-cursor machinery (`cursorFromChunks`)
 * rather than duplicating a chunk-buffering cursor — the same
 * bounded-memory, one-chunk-at-a-time contract applies here: a row is
 * assembled and yielded, then discarded, so a multi-million-row CSV costs
 * the same peak memory as a small one.
 *
 * Pure and dependency-free (no `react-native`/`expo-*` import) so it can be
 * tested with plain strings/async generators under `tsx` — see
 * `scripts/test-csv-stream.ts`.
 *
 * Mercury export layout (see `utils/data-transfer-io.ts#exportData`):
 *   row 1: one field — the JSON meta blob (format, version, exportedAt,
 *          appVersion, accounts, categories, budgets, quickPresets, settings)
 *   row 2: the transaction header row (see `TRANSACTION_CSV_COLUMNS` in
 *          `utils/data-transfer.ts`) — read positionally, not assumed fixed,
 *          so a hand-edited or reordered file still round-trips
 *   row 3+: one transaction per row
 * Every row, including the meta line, is itself valid CSV (a JSON blob with
 * commas/quotes is just a field that needs quoting, which `csvRow` already
 * handles) — a spreadsheet app opening this file sees two unusual rows
 * before the real header rather than a parse error.
 */

import { CharCursor, cursorFromChunks, MercuryExportMeta } from './json-stream';
import { csvRowToRawTransaction } from './data-transfer';

/** Wraps a field in quotes (doubling internal quotes) only if it needs it — comma, quote, or newline. */
export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** One CSV line, comma-joined and escaped, newline-terminated. */
export function csvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(',') + '\n';
}

/** Reads one CSV row (quoted fields may contain commas/quotes/newlines) from a char cursor, or null at end of input. */
async function readCsvRow(cur: CharCursor): Promise<string[] | null> {
  if ((await cur.peek()) === null) return null;

  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  while (true) {
    const c = await cur.next();
    if (c === null) {
      fields.push(field);
      return fields;
    }
    if (inQuotes) {
      if (c === '"') {
        if ((await cur.peek()) === '"') {
          await cur.next();
          field += '"';
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') {
      inQuotes = true;
      continue;
    }
    if (c === ',') {
      fields.push(field);
      field = '';
      continue;
    }
    if (c === '\r') {
      if ((await cur.peek()) === '\n') await cur.next();
      fields.push(field);
      return fields;
    }
    if (c === '\n') {
      fields.push(field);
      return fields;
    }
    field += c;
  }
}

/** Streams rows out of CSV text chunks, one at a time — never the whole file in memory. */
export async function* parseCsvRows(chunks: AsyncIterable<string>): AsyncGenerator<string[]> {
  const cur = cursorFromChunks(chunks);
  while (true) {
    const row = await readCsvRow(cur);
    if (row === null) return;
    yield row;
  }
}

/**
 * Reads a Mercury CSV export: the meta line, the transaction header row,
 * then every transaction row, handed to `onTransaction` one at a time as a
 * `Record<string, unknown>` shaped the same way a JSON-parsed transaction
 * would be — the same `parseTransactionItem` validation in
 * `utils/data-transfer.ts` runs unchanged against either source.
 *
 * Same signature/contract as `utils/json-stream.ts#readMercuryExport`
 * (`(chunks, onTransaction) => Promise<MercuryExportMeta>`), so
 * `utils/import-stream.ts`'s preview/apply logic can call either reader
 * interchangeably without its own body needing to know which format it's
 * reading.
 */
export async function readMercuryExportCsv(
  chunks: AsyncIterable<string>,
  onTransaction: (raw: unknown, metaSoFar: MercuryExportMeta) => Promise<void> | void
): Promise<MercuryExportMeta> {
  const rows = parseCsvRows(chunks);

  const metaRow = await rows.next();
  if (metaRow.done) throw new Error("That file isn't a valid Mercury backup.");
  let meta: unknown;
  try {
    meta = JSON.parse(metaRow.value[0] ?? '');
  } catch {
    throw new Error("That file isn't a valid Mercury backup.");
  }
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    throw new Error("That file isn't a valid Mercury backup.");
  }
  const metaRecord = meta as MercuryExportMeta;

  const headerRow = await rows.next();
  if (headerRow.done) return metaRecord; // no header row at all means zero transactions
  const columns = headerRow.value;

  for await (const row of rows) {
    if (row.length === 1 && row[0] === '') continue; // a stray trailing blank line
    await onTransaction(csvRowToRawTransaction(columns, row), metaRecord);
  }

  return metaRecord;
}
