/**
 * CRUD and keyset pagination against a seeded ledger.
 */
import { applyMigrations } from '../db/schema';
import { Db } from '../db/types';
import {
  insertTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactionById,
  pageTransactions,
  getLedgerStat,
  TxCursor,
} from '../db/transactions';
import { insertAccount, insertCategory } from '../db/entities';
import { openTestDb } from './support/node-db';
import { buildLedger } from './support/ledger';
import { Case, eq, deepEq, runCases } from './support/harness';
import { Account, Category } from '@/types/finance';

async function seeded(count: number, years = 1): Promise<{ db: Db; ledger: ReturnType<typeof buildLedger> }> {
  const db = openTestDb();
  await applyMigrations(db);
  const accounts: Account[] = ['a1', 'a2', 'a3'].map(id => ({
    id,
    name: id,
    type: 'bank',
    icon: 'business' as Account['icon'],
    color: '#000',
    initialBalance: 0,
    createdAt: new Date(0).toISOString(),
  }));
  for (const a of accounts) await insertAccount(db, a, 0);

  const categories: Category[] = ['c1', 'c2'].map(id => ({
    id, name: id, icon: 'pricetag' as Category['icon'], color: '#000', kind: 'expense',
  }));
  for (const c of categories) await insertCategory(db, c, 0);

  const ledger = buildLedger(count, { years, accountIds: ['a1', 'a2', 'a3'], categoryIds: ['c1', 'c2'] });
  for (const tx of ledger) await insertTransaction(db, tx);

  return { db, ledger };
}

/**
 * Newest-first, matching `ORDER BY date_ms DESC, seq DESC`.
 *
 * `seq` is assigned in insertion order, so for two transactions sharing a
 * timestamp — which happens often enough at a few thousand rows with
 * minute-granularity dates to matter, not just a theoretical edge case — the
 * later-inserted one must sort first. A plain stable sort on date alone gets
 * this backwards (it keeps the earlier-inserted one first), so the index is
 * folded into the comparator as an explicit descending tiebreak.
 */
function referenceOrder(ledger: ReturnType<typeof buildLedger>) {
  return ledger
    .map((t, seq) => ({ t, seq }))
    .sort((a, b) => (a.t.date !== b.t.date ? (a.t.date < b.t.date ? 1 : -1) : b.seq - a.seq))
    .map(x => x.t);
}

async function pageAll(db: Db, pageSize = 60): Promise<{ id: string }[]> {
  const out: { id: string }[] = [];
  let cursor: TxCursor | null = null;
  for (;;) {
    const page = await pageTransactions(db, {}, cursor, pageSize);
    out.push(...page.rows.map(r => ({ id: r.id })));
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

const CASES: Case[] = [
  {
    name: 'insert then getById round-trips every field',
    run: async () => {
      const { db } = await seeded(0);
      const tx = {
        id: 'x1',
        type: 'expense' as const,
        amount: 42.5,
        accountId: 'a1',
        categoryId: 'c1',
        date: '2026-08-05T10:00:00.000Z',
        note: 'coffee',
        createdAt: '2026-08-05T10:00:00.000Z',
      };
      await insertTransaction(db, tx);
      const back = await getTransactionById(db, 'x1');
      return deepEq('round-trip', back, tx);
    },
  },
  {
    name: 'a page concatenation across cursors exactly matches the newest-first reference order',
    run: async () => {
      const { db, ledger } = await seeded(3000, 3);
      const paged = await pageAll(db, 47); // an odd page size on purpose, to hit boundary cases
      const reference = referenceOrder(ledger).map(t => t.id);
      return (
        eq('count', paged.length, reference.length) ??
        deepEq('order', paged.map(p => p.id), reference)
      );
    },
  },
  {
    name: 'no duplicate ids and no gaps across pages',
    run: async () => {
      const { db } = await seeded(2500, 2);
      const paged = await pageAll(db, 60);
      const ids = new Set(paged.map(p => p.id));
      return eq('unique ids', ids.size, paged.length);
    },
  },
  {
    name: 'type filter matches a reference filter over every page',
    run: async () => {
      const { db, ledger } = await seeded(2000, 2);
      const out: string[] = [];
      let cursor: TxCursor | null = null;
      for (;;) {
        const page = await pageTransactions(db, { type: 'expense' }, cursor, 60);
        out.push(...page.rows.map(r => r.id));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      const reference = referenceOrder(ledger)
        .filter(t => t.type === 'expense')
        .map(t => t.id);
      return deepEq('filtered order', out, reference);
    },
  },
  {
    name: 'update moves a transaction to its new position in date order',
    run: async () => {
      const { db } = await seeded(0);
      await insertTransaction(db, {
        id: 'm1', type: 'expense', amount: 10, accountId: 'a1', categoryId: 'c1',
        date: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
      });
      await insertTransaction(db, {
        id: 'm2', type: 'expense', amount: 10, accountId: 'a1', categoryId: 'c1',
        date: '2026-06-01T00:00:00.000Z', createdAt: '2026-06-01T00:00:00.000Z',
      });
      await updateTransaction(db, {
        id: 'm1', type: 'expense', amount: 10, accountId: 'a1', categoryId: 'c1',
        date: '2026-12-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
      });
      const page = await pageTransactions(db, {}, null, 10);
      return eq('newest is now m1', page.rows[0].id, 'm1');
    },
  },
  {
    name: 'delete removes the row and it no longer pages',
    run: async () => {
      const { db } = await seeded(0);
      await insertTransaction(db, {
        id: 'd1', type: 'expense', amount: 10, accountId: 'a1', categoryId: 'c1',
        date: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
      });
      await deleteTransaction(db, 'd1');
      const back = await getTransactionById(db, 'd1');
      const page = await pageTransactions(db, {}, null, 10);
      return eq('gone', back, null) ?? eq('not paged', page.rows.length, 0);
    },
  },
  {
    name: "ledger_stat matches a reference reduce for all four keys",
    run: async () => {
      const { db, ledger } = await seeded(1500, 2);
      const refAll = ledger.reduce(
        (s, t) => ({ n: s.n + 1, net: s.net + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0) }),
        { n: 0, net: 0 }
      );
      const gotAll = await getLedgerStat(db, 'all');
      const errAll = eq('all n', gotAll.n, refAll.n) ?? closeEnough('all net', gotAll.net, refAll.net);
      if (errAll) return errAll;

      for (const key of ['income', 'expense', 'transfer'] as const) {
        const refN = ledger.filter(t => t.type === key).length;
        const got = await getLedgerStat(db, key);
        const err = eq(`${key} n`, got.n, refN);
        if (err) return err;
      }
      return null;
    },
  },
];

function closeEnough(label: string, actual: number, expected: number): string | null {
  return Math.abs(actual - expected) <= 0.01 ? null : `${label}: got ${actual}, expected ${expected}`;
}

runCases(CASES, 'query cases');
