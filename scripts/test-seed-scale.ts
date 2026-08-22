/**
 * Checks the configurable-scale random ledger generator used by Settings'
 * "Fill test data" flow: uniform distribution across the requested ranges
 * (no recurring pattern), progress/cancel plumbing, and that the resulting
 * SQLite state (balances, ledger_stat) matches a plain-JS reduce over
 * whatever actually got inserted.
 *
 * Run with: npm run test:seed-scale
 */

import { applyMigrations } from '../db/schema';
import { listAccounts, listAccountBalances, getNetWorth } from '../db/entities';
import { getLedgerStat, pageTransactions } from '../db/transactions';
import { generateRandomLedger, seedScaleData } from '../db/seed-scale';
import { openTestDb } from './support/node-db';
import { Case, close, eq, runCases } from './support/harness';

const CASES: Case[] = [
  {
    name: 'generator produces exactly `count` rows with unique sequential ids',
    run: () => {
      const rows = [
        ...generateRandomLedger({
          count: 500,
          years: 5,
          minAmount: 1,
          maxAmount: 100,
          expenseWeight: 1,
          incomeWeight: 1,
          transferWeight: 1,
          accountIds: ['a1', 'a2'],
          expenseCategoryIds: ['c1'],
          incomeCategoryIds: ['c2'],
          seed: 7,
        }),
      ];
      const ids = new Set(rows.map(r => r.id));
      return eq('row count', rows.length, 500) ?? eq('all ids unique', ids.size, 500);
    },
  },
  {
    name: 'amounts stay within the requested range',
    run: () => {
      const rows = [
        ...generateRandomLedger({
          count: 2000,
          years: 5,
          minAmount: 10,
          maxAmount: 20,
          expenseWeight: 1,
          incomeWeight: 1,
          transferWeight: 1,
          accountIds: ['a1'],
          expenseCategoryIds: ['c1'],
          incomeCategoryIds: ['c2'],
          seed: 11,
        }),
      ];
      const outOfRange = rows.filter(r => r.amount < 10 || r.amount > 20);
      return eq('all amounts within [10, 20]', outOfRange.length, 0);
    },
  },
  {
    name: 'dates stay within the requested years-back window, with no clustering by day-of-month',
    run: () => {
      const rows = [
        ...generateRandomLedger({
          count: 5000,
          years: 3,
          minAmount: 1,
          maxAmount: 100,
          expenseWeight: 1,
          incomeWeight: 0,
          transferWeight: 0,
          accountIds: ['a1'],
          expenseCategoryIds: ['c1'],
          incomeCategoryIds: [],
          seed: 3,
        }),
      ];
      const now = Date.now();
      const threeYearsMs = 3 * 365 * 24 * 60 * 60 * 1000;
      const outOfWindow = rows.filter(r => {
        const t = Date.parse(r.date);
        return t < now - threeYearsMs - 86_400_000 || t > now;
      });
      // Spread across day-of-month should look roughly uniform, not spiked
      // on the 1st/15th the way a "recurring bills" generator would be.
      const dayOfMonthCounts = new Map<number, number>();
      for (const r of rows) {
        const d = new Date(r.date).getDate();
        dayOfMonthCounts.set(d, (dayOfMonthCounts.get(d) ?? 0) + 1);
      }
      const maxDay = Math.max(...dayOfMonthCounts.values());
      const avgDay = rows.length / 28;
      return (
        eq('dates within window', outOfWindow.length, 0) ??
        (maxDay > avgDay * 3 ? `day-of-month too spiky: max ${maxDay}, avg ${avgDay.toFixed(0)}` : null)
      );
    },
  },
  {
    name: 'weights control the observed type mix',
    run: () => {
      const rows = [
        ...generateRandomLedger({
          count: 10000,
          years: 5,
          minAmount: 1,
          maxAmount: 100,
          expenseWeight: 9,
          incomeWeight: 1,
          transferWeight: 0,
          accountIds: ['a1', 'a2'],
          expenseCategoryIds: ['c1'],
          incomeCategoryIds: ['c2'],
          seed: 5,
        }),
      ];
      const expenseCount = rows.filter(r => r.type === 'expense').length;
      const ratio = expenseCount / rows.length;
      // Expect ~90% expense; generous tolerance since it's still random.
      return ratio > 0.85 && ratio < 0.95 ? null : `expense ratio ${ratio.toFixed(3)}, expected ~0.9`;
    },
  },
  {
    name: 'transfers never have toAccountId === accountId',
    run: () => {
      const rows = [
        ...generateRandomLedger({
          count: 5000,
          years: 5,
          minAmount: 1,
          maxAmount: 100,
          expenseWeight: 0,
          incomeWeight: 0,
          transferWeight: 1,
          accountIds: ['a1', 'a2', 'a3'],
          expenseCategoryIds: ['c1'],
          incomeCategoryIds: ['c2'],
          seed: 9,
        }),
      ];
      const selfTransfers = rows.filter(r => r.type === 'transfer' && r.toAccountId === r.accountId);
      return eq('no self-transfers', selfTransfers.length, 0);
    },
  },
  {
    name: 'seedScaleData wipes existing data and inserts the requested count',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      const result = await seedScaleData(db, {
        count: 3000,
        years: 4,
        minAmount: 5,
        maxAmount: 500,
        expenseWeight: 6,
        incomeWeight: 3,
        transferWeight: 1,
        accountCount: 3,
      });
      const accounts = await listAccounts(db);
      const page = await pageTransactions(db, {}, null, 10);
      return (
        eq('inserted count', result.inserted, 3000) ??
        eq('cancelled', result.cancelled, false) ??
        eq('account count', accounts.length, 3) ??
        eq('page returns rows', page.rows.length, 10)
      );
    },
  },
  {
    name: 'progress callback fires with monotonically increasing counts up to the total',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      const calls: number[] = [];
      await seedScaleData(db, {
        count: 45000,
        years: 2,
        minAmount: 1,
        maxAmount: 50,
        expenseWeight: 1,
        incomeWeight: 1,
        transferWeight: 1,
        accountCount: 2,
        onProgress: inserted => calls.push(inserted),
      });
      const increasing = calls.every((v, i) => i === 0 || v > calls[i - 1]);
      return (
        (calls.length >= 2 ? null : `expected multiple progress calls, got ${calls.length}`) ??
        (increasing ? null : 'progress calls were not monotonically increasing') ??
        eq('final progress equals total inserted', calls[calls.length - 1], 45000)
      );
    },
  },
  {
    name: 'cancelling stops early but leaves a consistent, queryable state',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      let seen = 0;
      const result = await seedScaleData(db, {
        count: 200000,
        years: 3,
        minAmount: 1,
        maxAmount: 100,
        expenseWeight: 1,
        incomeWeight: 1,
        transferWeight: 1,
        accountCount: 2,
        onProgress: inserted => {
          seen = inserted;
        },
        shouldCancel: () => seen >= 40000,
      });
      const page = await pageTransactions(db, {}, null, 5);
      const netWorth = await getNetWorth(db);
      return (
        eq('cancelled flag set', result.cancelled, true) ??
        (result.inserted > 0 && result.inserted < 200000
          ? null
          : `expected a partial insert, got ${result.inserted}`) ??
        eq('still queryable after cancel', page.rows.length, 5) ??
        (Number.isFinite(netWorth) ? null : 'net worth not finite after cancelled run')
      );
    },
  },
  {
    name: 'balances and ledger_stat match a plain reduce after a scale seed',
    run: async () => {
      const db = openTestDb();
      await applyMigrations(db);
      await seedScaleData(db, {
        count: 4000,
        years: 3,
        minAmount: 10,
        maxAmount: 200,
        expenseWeight: 5,
        incomeWeight: 3,
        transferWeight: 2,
        accountCount: 4,
      });

      const accounts = await listAccounts(db);
      const balances = await listAccountBalances(db);
      const stat = await getLedgerStat(db, 'all');

      // Oracle: reduce every page of the ledger in JS.
      let cursor = null as Parameters<typeof pageTransactions>[2];
      const all = [];
      do {
        const page = await pageTransactions(db, {}, cursor, 500);
        all.push(...page.rows);
        cursor = page.nextCursor;
      } while (cursor);

      const expectedBalance = new Map(accounts.map(a => [a.id, a.initialBalance]));
      let expectedNet = 0;
      let expectedCount = 0;
      for (const t of all) {
        expectedCount++;
        if (t.type === 'expense') {
          expectedBalance.set(t.accountId, (expectedBalance.get(t.accountId) ?? 0) - t.amount);
          expectedNet -= t.amount;
        } else if (t.type === 'income') {
          expectedBalance.set(t.accountId, (expectedBalance.get(t.accountId) ?? 0) + t.amount);
          expectedNet += t.amount;
        } else {
          expectedBalance.set(t.accountId, (expectedBalance.get(t.accountId) ?? 0) - t.amount);
          if (t.toAccountId) {
            expectedBalance.set(t.toAccountId, (expectedBalance.get(t.toAccountId) ?? 0) + t.amount);
          }
        }
      }

      for (const [id, expected] of expectedBalance) {
        const fail = close(`balance for ${id}`, balances.get(id) ?? NaN, expected);
        if (fail) return fail;
      }
      return eq('ledger_stat count', stat.n, expectedCount) ?? close('ledger_stat net', stat.net, expectedNet);
    },
  },
];

runCases(CASES, 'seed-scale cases');
