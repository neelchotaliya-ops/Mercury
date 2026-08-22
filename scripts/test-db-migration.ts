/**
 * The one-time blob-to-SQLite migration: normal data, edge cases, and the
 * failure paths that must not lose or half-apply anything.
 */
import { applyMigrations, getMeta } from '../db/schema';
import { migrateBlobIntoDb } from '../db/migrate-from-blob';
import { getTransactionById, pageTransactions } from '../db/transactions';
import { listAccounts, listCategories, listAccountBalances, getSettings } from '../db/entities';
import { openTestDb } from './support/node-db';
import { Case, eq, close, runCases } from './support/harness';

function baseBlob() {
  return {
    accounts: [
      { id: 'a1', name: 'Checking', type: 'bank', icon: 'business', color: '#000', initialBalance: 1000, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'a2', name: 'Cash', type: 'cash', icon: 'cash', color: '#000', initialBalance: 200, createdAt: '2026-01-01T00:00:00.000Z' },
    ],
    categories: [
      { id: 'c1', name: 'Groceries', icon: 'cart', color: '#000', kind: 'expense' },
      { id: 'c2', name: 'Salary', icon: 'wallet', color: '#000', kind: 'income' },
    ],
    transactions: [
      { id: 't1', type: 'expense', amount: 50, accountId: 'a1', categoryId: 'c1', date: '2026-08-01T10:00:00.000Z', createdAt: '2026-08-01T10:00:00.000Z', note: 'groceries' },
      { id: 't2', type: 'income', amount: 3000, accountId: 'a1', categoryId: 'c2', date: '2026-08-02T10:00:00.000Z', createdAt: '2026-08-02T10:00:00.000Z' },
      { id: 't3', type: 'transfer', amount: 100, accountId: 'a1', toAccountId: 'a2', date: '2026-08-03T10:00:00.000Z', createdAt: '2026-08-03T10:00:00.000Z' },
    ],
    budgets: [{ id: 'b1', categoryId: 'c1', monthlyLimit: 500, createdAt: '2026-08-01T00:00:00.000Z' }],
    quickPresets: [{ id: 'p1', label: 'Coffee', emoji: '☕', amount: 5, type: 'expense', categoryId: 'c1', accountId: 'a1' }],
    settings: { currency: 'USD', numberFormat: 'indian', hasOnboarded: true },
  };
}

const CASES: Case[] = [
  {
    name: 'null blob (fresh install) marks done and imports nothing',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      const result = await migrateBlobIntoDb(db, null);
      const state = await getMeta(db, 'blob_migration_state');
      return eq('status', result.status, 'empty') ?? eq('meta', state, 'done');
    },
  },
  {
    name: 'a normal blob imports every entity and every valid transaction',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      const result = await migrateBlobIntoDb(db, JSON.stringify(baseBlob()));
      if (result.status !== 'migrated') return `expected migrated, got ${result.status}`;

      const accounts = await listAccounts(db);
      const categories = await listCategories(db);
      const settings = await getSettings(db);
      const t1 = await getTransactionById(db, 't1');
      const t3 = await getTransactionById(db, 't3');

      return (
        eq('accounts', accounts.length, 2) ??
        eq('categories', categories.length, 2) ??
        eq('imported.transactions', result.imported?.transactions, 3) ??
        eq('t1 exists', Boolean(t1), true) ??
        eq('t3 is a transfer', t3?.type, 'transfer') ??
        eq('currency', settings.currency, 'USD') ??
        eq('numberFormat', settings.numberFormat, 'indian') ??
        eq('hasOnboarded', settings.hasOnboarded, true)
      );
    },
  },
  {
    name: 'imported transactions produce correct account balances via the rollup path',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      await migrateBlobIntoDb(db, JSON.stringify(baseBlob()));
      // a1: 1000 + 3000(income) - 50(expense) - 100(transfer out) = 3850
      // a2: 200 + 100(transfer in) = 300
      const balances = await listAccountBalances(db);
      return close('a1', balances.get('a1') ?? 0, 3850, 0.01) ?? close('a2', balances.get('a2') ?? 0, 300, 0.01);
    },
  },
  {
    name: 'a transaction referencing a missing account is dropped, not imported',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      const blob = baseBlob();
      blob.transactions.push({
        id: 'ghost', type: 'expense', amount: 10, accountId: 'does-not-exist',
        categoryId: 'c1', date: '2026-08-04T00:00:00.000Z', createdAt: '2026-08-04T00:00:00.000Z',
      } as any);
      const result = await migrateBlobIntoDb(db, JSON.stringify(blob));
      const ghost = await getTransactionById(db, 'ghost');
      return eq('dropped count', result.droppedTransactions, 1) ?? eq('not imported', ghost, null);
    },
  },
  {
    name: 'a transfer with no valid destination account is dropped',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      const blob = baseBlob();
      blob.transactions.push({
        id: 'badtransfer', type: 'transfer', amount: 10, accountId: 'a1', toAccountId: 'nope',
        date: '2026-08-05T00:00:00.000Z', createdAt: '2026-08-05T00:00:00.000Z',
      } as any);
      await migrateBlobIntoDb(db, JSON.stringify(blob));
      const bad = await getTransactionById(db, 'badtransfer');
      return eq('not imported', bad, null);
    },
  },
  {
    name: 'zero accounts (a fresh-install-shaped blob) migrates cleanly, not rejected',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      const blob = {
        accounts: [], transactions: [], budgets: [],
        categories: [{ id: 'c1', name: 'Groceries', icon: 'cart', color: '#000', kind: 'expense' }],
        quickPresets: [],
        settings: { currency: 'USD', hasOnboarded: true },
      };
      const result = await migrateBlobIntoDb(db, JSON.stringify(blob));
      const categories = await listCategories(db);
      return eq('status', result.status, 'migrated') ?? eq('categories', categories.length, 1);
    },
  },
  {
    name: 'truncated/invalid JSON fails without touching the database',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      const result = await migrateBlobIntoDb(db, '{"accounts": [ { "id": "a1", "nam');
      const state = await getMeta(db, 'blob_migration_state');
      const accounts = await listAccounts(db);
      return (
        eq('status', result.status, 'failed') ??
        eq('meta marks failed', state, 'failed') ??
        eq('nothing imported', accounts.length, 0)
      );
    },
  },
  {
    name: 'a JSON array instead of an object fails cleanly',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      const result = await migrateBlobIntoDb(db, '[1, 2, 3]');
      return eq('status', result.status, 'failed');
    },
  },
  {
    name: 'a second call after success is idempotent and re-imports nothing',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      await migrateBlobIntoDb(db, JSON.stringify(baseBlob()));
      const before = await listAccounts(db);
      const second = await migrateBlobIntoDb(db, JSON.stringify(baseBlob()));
      const after = await listAccounts(db);
      return eq('second call status', second.status, 'already-done') ?? eq('account count unchanged', after.length, before.length);
    },
  },
  {
    name: 'imported ledger pages correctly (newest first) through the normal query path',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      await migrateBlobIntoDb(db, JSON.stringify(baseBlob()));
      const page = await pageTransactions(db, {}, null, 10);
      return eq('newest first', page.rows[0].id, 't3') ?? eq('count', page.rows.length, 3);
    },
  },
];

runCases(CASES, 'migration cases');
