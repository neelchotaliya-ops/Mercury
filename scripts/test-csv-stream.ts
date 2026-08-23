/**
 * Checks the CSV reader/writer used for CSV import/export: field escaping,
 * row parsing across arbitrary chunk boundaries (same reasoning as
 * `scripts/test-json-stream.ts` — a real file read splits at fixed byte
 * offsets with no regard for token boundaries, so every case runs once as a
 * single chunk and again split character-by-character), and the full
 * write-then-read round trip through `readMercuryExportCsv` +
 * `parseTransactionItem`.
 *
 * Run with: npm run test:csv-stream
 */

import { escapeCsvField, csvRow, parseCsvRows, readMercuryExportCsv } from '../utils/csv-stream';
import {
  transactionToCsvRow,
  csvRowToRawTransaction,
  parseTransactionItem,
  TRANSACTION_CSV_COLUMNS,
} from '../utils/data-transfer';
import { Transaction } from '../types/finance';
import { Case, deepEq, eq, runCases } from './support/harness';

async function* wholeChunk(text: string): AsyncIterable<string> {
  yield text;
}

async function* byChar(text: string): AsyncIterable<string> {
  for (const ch of text) yield ch;
}

async function collectRows(text: string, chunker: (t: string) => AsyncIterable<string>): Promise<string[][]> {
  const out: string[][] = [];
  for await (const row of parseCsvRows(chunker(text))) out.push(row);
  return out;
}

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  type: 'expense',
  amount: 42.5,
  accountId: 'a1',
  date: '2025-06-01T10:00:00.000Z',
  createdAt: '2025-06-01T10:00:00.000Z',
  ...overrides,
});

const CASES: Case[] = [
  {
    name: 'escapeCsvField leaves plain text untouched',
    run: () => eq('unescaped', escapeCsvField('Groceries'), 'Groceries'),
  },
  {
    name: 'escapeCsvField quotes and doubles internal quotes for a comma/quote/newline field',
    run: () =>
      eq(
        'escaped',
        escapeCsvField('Coffee, "the usual"\nsecond line'),
        '"Coffee, ""the usual""\nsecond line"'
      ),
  },
  {
    name: 'a row with a comma, a quoted field, and a newline round-trips through parseCsvRows',
    run: async () => {
      const text = csvRow(['plain', 'has,comma', 'has "quote"', 'has\nnewline']);
      for (const chunker of [wholeChunk, byChar]) {
        const rows = await collectRows(text, chunker);
        const err =
          eq(`${chunker.name}: row count`, rows.length, 1) ??
          deepEq(`${chunker.name}: fields`, rows[0], ['plain', 'has,comma', 'has "quote"', 'has\nnewline']);
        if (err) return err;
      }
      return null;
    },
  },
  {
    name: 'multiple rows parse in order across chunk boundaries',
    run: async () => {
      const text = csvRow(['a', '1']) + csvRow(['b', '2']) + csvRow(['c', '3']);
      for (const chunker of [wholeChunk, byChar]) {
        const rows = await collectRows(text, chunker);
        const err = deepEq(`${chunker.name}: rows`, rows, [
          ['a', '1'],
          ['b', '2'],
          ['c', '3'],
        ]);
        if (err) return err;
      }
      return null;
    },
  },
  {
    name: 'a file with no trailing newline still yields the last row',
    run: async () => {
      const text = csvRow(['a', '1']) + 'b,2'; // no trailing \n on the last row
      const rows = await collectRows(text, wholeChunk);
      return deepEq('rows', rows, [
        ['a', '1'],
        ['b', '2'],
      ]);
    },
  },
  {
    name: 'transactionToCsvRow / csvRowToRawTransaction round-trip through parseTransactionItem',
    run: async () => {
      const original = tx({
        id: 'tx-round-trip',
        note: 'Coffee, "the usual" · UPI/123\nfollow-up line',
        categoryId: 'c1',
      });
      const row = transactionToCsvRow(original);
      const line = csvRow(row);

      // Simulate the file round trip: write with csvRow, read back with parseCsvRows.
      const parsedRows = await collectRows(line, wholeChunk);
      const raw = csvRowToRawTransaction([...TRANSACTION_CSV_COLUMNS], parsedRows[0]);
      const result = parseTransactionItem(raw, new Set(['a1']));

      // Field-by-field, not deepEq on the whole object — parseTransactionItem
      // builds its return value with a fixed key order that legitimately
      // differs from `original`'s, which JSON.stringify-based deepEq would
      // wrongly flag as a mismatch despite every value matching.
      if (!result) return 'expected a valid transaction, got null';
      return (
        eq('id', result.id, original.id) ??
        eq('type', result.type, original.type) ??
        eq('amount', result.amount, original.amount) ??
        eq('accountId', result.accountId, original.accountId) ??
        eq('categoryId', result.categoryId, original.categoryId) ??
        eq('date', result.date, original.date) ??
        eq('note', result.note, original.note) ??
        eq('createdAt', result.createdAt, original.createdAt)
      );
    },
  },
  {
    name: 'an optional-field-absent transaction round-trips with those fields undefined, not empty strings',
    run: async () => {
      const original = tx({ id: 'no-optionals', toAccountId: undefined, categoryId: undefined, note: undefined });
      const row = transactionToCsvRow(original);
      const line = csvRow(row);
      const parsedRows = await collectRows(line, wholeChunk);
      const raw = csvRowToRawTransaction([...TRANSACTION_CSV_COLUMNS], parsedRows[0]);
      return (
        eq('toAccountId absent', 'toAccountId' in raw, false) ??
        eq('categoryId absent', 'categoryId' in raw, false) ??
        eq('note absent', 'note' in raw, false)
      );
    },
  },
  {
    name: 'readMercuryExportCsv reads the meta line, header row, and every transaction',
    run: async () => {
      const meta = {
        format: 'mercury-finance-export',
        version: 1,
        exportedAt: '2025-06-01T00:00:00.000Z',
        accounts: [{ id: 'a1', name: 'Cash', type: 'cash', icon: 'wallet', color: '#000', initialBalance: 0, createdAt: '2025-01-01T00:00:00.000Z' }],
        categories: [],
        budgets: [],
        quickPresets: [],
        settings: { currency: 'USD', hasOnboarded: true },
      };
      const txs = [tx({ id: 't1', amount: 10 }), tx({ id: 't2', amount: 20, note: 'a, b' })];
      const text =
        csvRow([JSON.stringify(meta)]) +
        csvRow([...TRANSACTION_CSV_COLUMNS]) +
        txs.map(t => csvRow(transactionToCsvRow(t))).join('');

      for (const chunker of [wholeChunk, byChar]) {
        const seen: unknown[] = [];
        const got = await readMercuryExportCsv(chunker(text), raw => {
          seen.push(raw);
        });
        const err =
          eq(`${chunker.name}: format`, (got as any).format, 'mercury-finance-export') ??
          eq(`${chunker.name}: transaction count`, seen.length, 2);
        if (err) return err;
      }
      return null;
    },
  },
  {
    name: 'readMercuryExportCsv on a zero-transaction file (meta + header row only) returns the meta with no callbacks',
    run: async () => {
      const meta = { format: 'mercury-finance-export', version: 1, accounts: [] };
      const text = csvRow([JSON.stringify(meta)]) + csvRow([...TRANSACTION_CSV_COLUMNS]);
      let calls = 0;
      const got = await readMercuryExportCsv(wholeChunk(text), () => {
        calls++;
      });
      return eq('no transaction callbacks', calls, 0) ?? eq('format', (got as any).format, 'mercury-finance-export');
    },
  },
  {
    name: 'readMercuryExportCsv rejects a file whose first line is not JSON',
    run: async () => {
      const text = csvRow(['not json at all']);
      try {
        await readMercuryExportCsv(wholeChunk(text), () => {});
        return 'expected a throw';
      } catch {
        return null;
      }
    },
  },
];

runCases(CASES, 'CSV stream cases');
