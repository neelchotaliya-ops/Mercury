/**
 * Equivalence: every db/insights.ts query must match the transaction-level
 * oracle in utils/insights.ts exactly (within float tolerance), across the
 * full range-preset matrix. This is what lets Insights move onto the rollup
 * without re-deriving trust in its numbers from scratch.
 */
import { applyMigrations } from '../db/schema';
import { Db } from '../db/types';
import { Account, Category } from '@/types/finance';
import { insertTransaction } from '../db/transactions';
import { insertAccount, insertCategory } from '../db/entities';
import * as dbInsights from '../db/insights';
import * as oracle from '@/utils/insights';
import { openTestDb } from './support/node-db';
import { buildLedger } from './support/ledger';
import { Case, eq, close, runCases } from './support/harness';

const ACCOUNT_IDS = ['a1', 'a2', 'a3'];
const CATEGORY_IDS = ['c1', 'c2', 'c3', 'c4'];
const NOW = new Date('2026-08-22T12:00:00.000Z');

async function seeded(count: number, years: number): Promise<{ db: Db; categories: Category[] }> {
  const db = openTestDb();
  await applyMigrations(db);
  for (const id of ACCOUNT_IDS) {
    const account: Account = {
      id, name: id, type: 'bank', icon: 'business', color: '#000', initialBalance: 0,
      createdAt: new Date(0).toISOString(),
    };
    await insertAccount(db, account, 0);
  }
  const categories: Category[] = CATEGORY_IDS.map((id, i) => ({
    id, name: id, icon: 'pricetag', color: '#000', kind: i % 2 === 0 ? 'expense' : 'income',
  }));
  for (const c of categories) await insertCategory(db, c, 0);

  const ledger = buildLedger(count, { years, accountIds: ACCOUNT_IDS, categoryIds: CATEGORY_IDS });
  for (const tx of ledger) await insertTransaction(db, tx);

  return { db, categories };
}

const RANGES: oracle.DateRangePreset[] = ['30d', '3m', '6m', '12m', 'ytd', 'all'];
const KINDS: ('income' | 'expense')[] = ['expense', 'income'];

const CASES: Case[] = [];

for (const range of RANGES) {
  for (const kind of KINDS) {
    CASES.push({
      name: `totals match the oracle: range=${range} kind=${kind}`,
      run: async () => {
        const { db } = await seeded(1200, 2);
        const filter: oracle.InsightFilter = { range, accountIds: [], categoryIds: [], kind };
        const dbFilter: dbInsights.InsightFilter = { range, accountIds: [], categoryIds: [], kind };

        // Oracle needs the raw ledger; pull it back for the reference call.
        const refTx = await db.getAllAsync<{ date: string; amount: number; type: string; category_id: string | null; account_id: string }>(
          'SELECT date, amount, type, category_id, account_id FROM transactions'
        );
        const refLedger = refTx.map((r, i) => ({
          id: `x${i}`, type: r.type as any, amount: r.amount, accountId: r.account_id,
          categoryId: r.category_id ?? undefined, date: r.date, createdAt: r.date,
        }));

        const refSelected = oracle.selectTransactions({ transactions: refLedger }, filter, NOW);
        const refTotals = oracle.computeTotals(refSelected);
        const gotTotals = await dbInsights.computeTotals(db, dbFilter, NOW);

        return (
          close('total', gotTotals.total, refTotals.total, 0.5) ??
          eq('count', gotTotals.count, refTotals.count) ??
          close('average', gotTotals.average, refTotals.average, 0.5) ??
          eq('activeDays', gotTotals.activeDays, refTotals.activeDays)
        );
      },
    });
  }
}

CASES.push({
  name: 'category breakdown matches the oracle',
  run: async () => {
    const { db, categories } = await seeded(1500, 2);
    const filter: oracle.InsightFilter = { range: '12m', accountIds: [], categoryIds: [], kind: 'expense' };
    const dbFilter: dbInsights.InsightFilter = { range: '12m', accountIds: [], categoryIds: [], kind: 'expense' };

    const refTx = await db.getAllAsync<{ date: string; amount: number; type: string; category_id: string | null; account_id: string }>(
      'SELECT date, amount, type, category_id, account_id FROM transactions'
    );
    const refLedger = refTx.map((r, i) => ({
      id: `x${i}`, type: r.type as any, amount: r.amount, accountId: r.account_id,
      categoryId: r.category_id ?? undefined, date: r.date, createdAt: r.date,
    }));

    const refSelected = oracle.selectTransactions({ transactions: refLedger }, filter, NOW);
    const refBreakdown = oracle.computeCategoryBreakdown(refSelected, categories);
    const gotBreakdown = await dbInsights.computeCategoryBreakdown(db, dbFilter, categories, NOW);

    if (refBreakdown.length !== gotBreakdown.length) {
      return `slice count: got ${gotBreakdown.length}, expected ${refBreakdown.length}`;
    }
    const refById = new Map(refBreakdown.map(s => [s.category.id, s]));
    for (const got of gotBreakdown) {
      const ref = refById.get(got.category.id);
      if (!ref) return `unexpected category ${got.category.id}`;
      const err = close(`amount[${got.category.id}]`, got.amount, ref.amount, 0.5) ?? eq(`count[${got.category.id}]`, got.count, ref.count);
      if (err) return err;
    }
    return null;
  },
});

CASES.push({
  name: 'monthly series matches the oracle, including gap-filled months',
  run: async () => {
    const { db } = await seeded(1000, 2);
    const filter: oracle.InsightFilter = { range: '12m', accountIds: [], categoryIds: [], kind: 'expense' };
    const dbFilter: dbInsights.InsightFilter = { range: '12m', accountIds: [], categoryIds: [], kind: 'expense' };
    const range = oracle.resolveRange('12m', NOW);

    const refTx = await db.getAllAsync<{ date: string; amount: number; type: string; category_id: string | null; account_id: string }>(
      'SELECT date, amount, type, category_id, account_id FROM transactions'
    );
    const refLedger = refTx.map((r, i) => ({
      id: `x${i}`, type: r.type as any, amount: r.amount, accountId: r.account_id,
      categoryId: r.category_id ?? undefined, date: r.date, createdAt: r.date,
    }));
    const refSelected = oracle.selectTransactions({ transactions: refLedger }, filter, NOW);
    const refSeries = oracle.computeMonthlySeries(refSelected, range, NOW);
    const gotSeries = await dbInsights.computeMonthlySeries(db, dbFilter, NOW);

    if (refSeries.length !== gotSeries.length) return `point count: got ${gotSeries.length}, expected ${refSeries.length}`;
    for (let i = 0; i < refSeries.length; i++) {
      const err =
        eq(`month[${i}].key`, gotSeries[i].monthKey, refSeries[i].monthKey) ??
        close(`month[${i}].amount`, gotSeries[i].amount, refSeries[i].amount, 0.5);
      if (err) return err;
    }
    return null;
  },
});

CASES.push({
  name: 'weekday pattern matches the oracle',
  run: async () => {
    const { db } = await seeded(1000, 2);
    const filter: oracle.InsightFilter = { range: 'all', accountIds: [], categoryIds: [], kind: 'expense' };
    const dbFilter: dbInsights.InsightFilter = { range: 'all', accountIds: [], categoryIds: [], kind: 'expense' };

    const refTx = await db.getAllAsync<{ date: string; amount: number; type: string; category_id: string | null; account_id: string }>(
      'SELECT date, amount, type, category_id, account_id FROM transactions'
    );
    const refLedger = refTx.map((r, i) => ({
      id: `x${i}`, type: r.type as any, amount: r.amount, accountId: r.account_id,
      categoryId: r.category_id ?? undefined, date: r.date, createdAt: r.date,
    }));
    const refSelected = oracle.selectTransactions({ transactions: refLedger }, filter, NOW);
    const refPattern = oracle.computeWeekdayPattern(refSelected);
    const gotPattern = await dbInsights.computeWeekdayPattern(db, { ...dbFilter, range: '12m' }, NOW);
    const refPattern12m = oracle.computeWeekdayPattern(
      oracle.selectTransactions({ transactions: refLedger }, { ...filter, range: '12m' }, NOW)
    );

    for (let i = 0; i < 7; i++) {
      const err = close(`day[${i}]`, gotPattern[i], refPattern12m[i], 0.5);
      if (err) return err;
    }
    return null;
  },
});

CASES.push({
  name: 'account-filtered totals match the oracle',
  run: async () => {
    const { db } = await seeded(1200, 2);
    const filter: oracle.InsightFilter = { range: '6m', accountIds: ['a1'], categoryIds: [], kind: 'expense' };
    const dbFilter: dbInsights.InsightFilter = { range: '6m', accountIds: ['a1'], categoryIds: [], kind: 'expense' };

    const refTx = await db.getAllAsync<{ date: string; amount: number; type: string; category_id: string | null; account_id: string }>(
      'SELECT date, amount, type, category_id, account_id FROM transactions'
    );
    const refLedger = refTx.map((r, i) => ({
      id: `x${i}`, type: r.type as any, amount: r.amount, accountId: r.account_id,
      categoryId: r.category_id ?? undefined, date: r.date, createdAt: r.date,
    }));
    const refSelected = oracle.selectTransactions({ transactions: refLedger }, filter, NOW);
    const refTotals = oracle.computeTotals(refSelected);
    const gotTotals = await dbInsights.computeTotals(db, dbFilter, NOW);

    return close('total', gotTotals.total, refTotals.total, 0.5) ?? eq('count', gotTotals.count, refTotals.count);
  },
});

CASES.push({
  name: 'compareWithPreviousPeriod matches the oracle',
  run: async () => {
    const { db } = await seeded(1200, 2);
    const filter: oracle.InsightFilter = { range: '3m', accountIds: [], categoryIds: [], kind: 'expense' };
    const dbFilter: dbInsights.InsightFilter = { range: '3m', accountIds: [], categoryIds: [], kind: 'expense' };

    const refTx = await db.getAllAsync<{ date: string; amount: number; type: string; category_id: string | null; account_id: string }>(
      'SELECT date, amount, type, category_id, account_id FROM transactions'
    );
    const refLedger = refTx.map((r, i) => ({
      id: `x${i}`, type: r.type as any, amount: r.amount, accountId: r.account_id,
      categoryId: r.category_id ?? undefined, date: r.date, createdAt: r.date,
    }));
    const refComparison = oracle.compareWithPreviousPeriod({ transactions: refLedger }, filter, NOW);
    const gotComparison = await dbInsights.compareWithPreviousPeriod(db, dbFilter, NOW);

    return (
      close('current', gotComparison.current, refComparison.current, 0.5) ??
      close('previous', gotComparison.previous, refComparison.previous, 0.5)
    );
  },
});

CASES.push({
  name: 'top notes match the oracle, grouped by prefix before the UPI-ref separator',
  run: async () => {
    const db = openTestDb();
    await applyMigrations(db);
    await insertAccount(db, { id: 'a1', name: 'a1', type: 'bank', icon: 'business', color: '#000', initialBalance: 0, createdAt: new Date(0).toISOString() }, 0);
    await insertCategory(db, { id: 'c1', name: 'c1', icon: 'pricetag', color: '#000', kind: 'expense' }, 0);

    const notes = ['Coffee Shop · UPI/123', 'Coffee Shop · UPI/456', 'Groceries', 'Groceries · UPI/789', 'Gas Station'];
    const refLedger = notes.map((note, i) => ({
      id: `n${i}`, type: 'expense' as const, amount: 10 + i, accountId: 'a1', categoryId: 'c1',
      date: '2026-08-01T10:00:00.000Z', createdAt: '2026-08-01T10:00:00.000Z', note,
    }));
    for (const tx of refLedger) await insertTransaction(db, tx);

    const filter: oracle.InsightFilter = { range: 'all', accountIds: [], categoryIds: [], kind: 'expense' };
    const dbFilter: dbInsights.InsightFilter = { range: 'all', accountIds: [], categoryIds: [], kind: 'expense' };

    const refTop = oracle.computeTopNotes(refLedger, 10);
    const gotTop = await dbInsights.computeTopNotes(db, dbFilter, 10, NOW);

    if (refTop.length !== gotTop.length) return `label count: got ${gotTop.length}, expected ${refTop.length}`;
    for (let i = 0; i < refTop.length; i++) {
      const err =
        eq(`label[${i}]`, gotTop[i].label, refTop[i].label) ??
        close(`amount[${i}]`, gotTop[i].amount, refTop[i].amount, 0.01) ??
        eq(`count[${i}]`, gotTop[i].count, refTop[i].count);
      if (err) return err;
    }
    return null;
  },
});

runCases(CASES, 'insights equivalence cases');


CASES.push({
  name: 'budget progress matches a plain JS reduce for the month',
  run: async () => {
    const dbEntities = await import('../db/entities');
    const db = openTestDb();
    await applyMigrations(db);
    await insertAccount(db, { id: 'a1', name: 'a1', type: 'bank', icon: 'business', color: '#000', initialBalance: 0, createdAt: new Date(0).toISOString() }, 0);
    await insertCategory(db, { id: 'c1', name: 'Groceries', icon: 'cart', color: '#000', kind: 'expense' }, 0);
    await insertCategory(db, { id: 'c2', name: 'Fun', icon: 'game-controller', color: '#000', kind: 'expense' }, 0);
    await dbEntities.insertBudget(db, { id: 'b1', categoryId: 'c1', monthlyLimit: 500, createdAt: new Date(0).toISOString() }, 0);

    const ledger = [
      { id: 't1', type: 'expense' as const, amount: 100, accountId: 'a1', categoryId: 'c1', date: '2026-08-05T00:00:00.000Z', createdAt: '2026-08-05T00:00:00.000Z' },
      { id: 't2', type: 'expense' as const, amount: 250, accountId: 'a1', categoryId: 'c1', date: '2026-08-15T00:00:00.000Z', createdAt: '2026-08-15T00:00:00.000Z' },
      { id: 't3', type: 'expense' as const, amount: 999, accountId: 'a1', categoryId: 'c1', date: '2026-09-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z' },
      { id: 't4', type: 'expense' as const, amount: 40, accountId: 'a1', categoryId: 'c2', date: '2026-08-05T00:00:00.000Z', createdAt: '2026-08-05T00:00:00.000Z' },
    ];
    for (const tx of ledger) await insertTransaction(db, tx);

    const progress = await dbEntities.getBudgetProgress(db, '2026-08');
    const row = progress.find((p: any) => p.budget.id === 'b1');
    return (
      close('spent', row?.spent ?? -1, 350, 0.01) ??
      close('percent', row?.percent ?? -1, 0.7, 0.001) ??
      close('remaining', row?.remaining ?? -9999, 150, 0.01)
    );
  },
});
