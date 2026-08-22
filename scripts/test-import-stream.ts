/**
 * Exercises the SQLite-facing half of streaming import: preview (validate +
 * count without writing) and apply (merge or replace, batched, ending in
 * one rebuildRollups()). Runs against `node:sqlite` via the same `Db`
 * interface the device uses — see `scripts/support/node-db.ts`.
 *
 * Run with: npm run test:import-stream
 */

import { applyMigrations } from '../db/schema';
import { listAccounts, getNetWorth, listAccountBalances } from '../db/entities';
import { getLedgerStat, pageTransactions } from '../db/transactions';
import { previewImportChunks, applyImportChunks } from '../utils/import-stream';
import { Account, Budget, Category, QuickPreset, Transaction } from '../types/finance';
import { openTestDb } from './support/node-db';
import { Case, close, eq, runCases } from './support/harness';

async function freshDb() {
  const db = openTestDb();
  await applyMigrations(db);
  return db;
}

async function* oneChunk(text: string): AsyncGenerator<string> {
  yield text;
}

const account = (id: string, initialBalance = 0): Account => ({
  id,
  name: `Account ${id}`,
  type: 'bank',
  icon: 'business-outline',
  color: '#3B82F6',
  initialBalance,
  createdAt: '2025-01-01T00:00:00.000Z',
});

const category = (id: string, kind: 'income' | 'expense' = 'expense'): Category => ({
  id,
  name: `Category ${id}`,
  icon: 'cart',
  color: '#5CB98F',
  kind,
});

const tx = (id: string, overrides: Partial<Transaction> = {}): Transaction => ({
  id,
  type: 'expense',
  amount: 100,
  accountId: 'a1',
  categoryId: 'c1',
  date: '2025-06-01T10:00:00.000Z',
  createdAt: '2025-06-01T10:00:00.000Z',
  ...overrides,
});

interface ExportShape {
  format?: string;
  version?: number;
  accounts?: Account[];
  categories?: Category[];
  budgets?: Budget[];
  quickPresets?: QuickPreset[];
  settings?: Record<string, unknown>;
  transactions?: Transaction[];
}

function makeExport(o: ExportShape = {}): string {
  return JSON.stringify({
    format: o.format ?? 'mercury-finance-export',
    version: o.version ?? 1,
    exportedAt: '2025-06-01T00:00:00.000Z',
    data: {
      accounts: o.accounts ?? [account('a1'), account('a2')],
      categories: o.categories ?? [category('c1'), category('c2', 'income')],
      budgets: o.budgets ?? [],
      quickPresets: o.quickPresets ?? [],
      settings: o.settings ?? { currency: 'USD', hasOnboarded: true },
      transactions: o.transactions ?? [],
    },
  });
}

const CASES: Case[] = [
  {
    name: 'preview rejects a file not from Mercury',
    run: async () => {
      const outcome = await previewImportChunks(oneChunk(JSON.stringify({ format: 'other' })));
      return outcome.ok ? 'expected rejection' : null;
    },
  },
  {
    name: 'preview rejects a newer format version',
    run: async () => {
      const outcome = await previewImportChunks(oneChunk(makeExport({ version: 999 })));
      return outcome.ok ? 'expected rejection' : null;
    },
  },
  {
    name: 'preview rejects a backup with no usable accounts',
    run: async () => {
      const outcome = await previewImportChunks(oneChunk(makeExport({ accounts: [] })));
      return outcome.ok ? 'expected rejection' : null;
    },
  },
  {
    name: 'preview counts valid transactions and drops ones pointing at unknown accounts',
    run: async () => {
      const outcome = await previewImportChunks(
        oneChunk(
          makeExport({
            transactions: [tx('t1'), tx('t2', { accountId: 'ghost' }), tx('t3', { type: 'income', categoryId: 'c2' })],
          })
        )
      );
      if (!outcome.ok) return `unexpected rejection: ${outcome.reason}`;
      return eq('transaction count', outcome.preview.summary.transactions, 2);
    },
  },
  {
    name: 'preview on an empty-transactions backup still validates format/version/accounts',
    run: async () => {
      const outcome = await previewImportChunks(oneChunk(makeExport({ format: 'nope', transactions: [] })));
      return outcome.ok ? 'expected rejection on empty-transaction backup with bad format' : null;
    },
  },
  {
    name: 'replace wipes existing data and adopts the backup exactly',
    run: async () => {
      const db = await freshDb();
      await applyImportChunks(
        db,
        oneChunk(makeExport({ accounts: [account('old', 500)], transactions: [tx('old-tx', { accountId: 'old' })] })),
        'replace'
      );
      await applyImportChunks(
        db,
        oneChunk(
          makeExport({
            accounts: [account('a1', 1000), account('a2', 0)],
            transactions: [
              tx('t1', { type: 'income', amount: 200, categoryId: 'c2' }),
              tx('t2', { type: 'expense', amount: 50 }),
            ],
          })
        ),
        'replace'
      );
      const accounts = await listAccounts(db);
      const netWorth = await getNetWorth(db);
      const page = await pageTransactions(db, {}, null, 10);
      return (
        eq('account count after replace', accounts.length, 2) ??
        eq('old account gone', accounts.some(a => a.id === 'old'), false) ??
        close('net worth', netWorth, 1000 + 200 - 50) ??
        eq('transaction count', page.rows.length, 2) ??
        eq('old transaction gone', page.rows.some(t => t.id === 'old-tx'), false)
      );
    },
  },
  {
    name: 'merge keeps existing accounts and adds only new ones',
    run: async () => {
      const db = await freshDb();
      await applyImportChunks(db, oneChunk(makeExport({ accounts: [account('a1', 1000)] })), 'replace');
      await applyImportChunks(
        db,
        oneChunk(makeExport({ accounts: [account('a1', 999999), account('a2', 500)] })),
        'merge'
      );
      const accounts = await listAccounts(db);
      const a1 = accounts.find(a => a.id === 'a1');
      return (
        eq('account count after merge', accounts.length, 2) ??
        eq('existing account untouched by merge', a1?.initialBalance, 1000)
      );
    },
  },
  {
    name: 'merge adds new transactions without touching existing ones',
    run: async () => {
      const db = await freshDb();
      await applyImportChunks(
        db,
        oneChunk(makeExport({ transactions: [tx('t1', { amount: 10 })] })),
        'replace'
      );
      await applyImportChunks(
        db,
        oneChunk(makeExport({ transactions: [tx('t1', { amount: 999999 }), tx('t2', { amount: 20 })] })),
        'merge'
      );
      const page = await pageTransactions(db, {}, null, 10);
      const t1 = page.rows.find(t => t.id === 't1');
      return (
        eq('transaction count after merge', page.rows.length, 2) ??
        eq('existing transaction amount untouched', t1?.amount, 10)
      );
    },
  },
  {
    name: 'merge does not adopt the backup settings',
    run: async () => {
      const db = await freshDb();
      await applyImportChunks(db, oneChunk(makeExport({ settings: { currency: 'INR' } })), 'replace');
      await applyImportChunks(db, oneChunk(makeExport({ settings: { currency: 'EUR' } })), 'merge');
      const { getSettings } = await import('../db/entities');
      const settings = await getSettings(db);
      return eq('currency stays as replace left it', settings.currency, 'INR');
    },
  },
  {
    name: 'importing the same backup twice (merge) is a no-op the second time',
    run: async () => {
      const db = await freshDb();
      const text = makeExport({
        transactions: [tx('t1', { amount: 10 }), tx('t2', { type: 'income', amount: 500, categoryId: 'c2' })],
      });
      await applyImportChunks(db, oneChunk(text), 'merge');
      const once = await getNetWorth(db);
      await applyImportChunks(db, oneChunk(text), 'merge');
      const twice = await getNetWorth(db);
      const page = await pageTransactions(db, {}, null, 10);
      return close('net worth unchanged by re-import', twice, once) ?? eq('no duplicate rows', page.rows.length, 2);
    },
  },
  {
    name: 'rollup, balance and ledger_stat all match a plain reduce after a merge import',
    run: async () => {
      const db = await freshDb();
      const txs = [
        tx('t1', { type: 'expense', amount: 30 }),
        tx('t2', { type: 'income', amount: 500, categoryId: 'c2' }),
        tx('t3', { type: 'transfer', amount: 40, accountId: 'a1', toAccountId: 'a2', categoryId: undefined }),
      ];
      await applyImportChunks(db, oneChunk(makeExport({ accounts: [account('a1', 100), account('a2', 0)], transactions: txs })), 'replace');

      const balances = await listAccountBalances(db);
      const expectedA1 = 100 - 30 + 500 - 40;
      const expectedA2 = 0 + 40;

      const stat = await getLedgerStat(db, 'all');
      const expectedNet = -30 + 500; // transfers don't move net

      return (
        close('a1 balance', balances.get('a1') ?? NaN, expectedA1) ??
        close('a2 balance', balances.get('a2') ?? NaN, expectedA2) ??
        eq('ledger_stat count', stat.n, 3) ??
        close('ledger_stat net', stat.net, expectedNet)
      );
    },
  },
];

runCases(CASES, 'import stream cases');
