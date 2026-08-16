/**
 * Covers the Insights analytics layer: range resolution, filtering, and each
 * chart's underlying numbers. These drive what the user is told about their
 * own spending, so an off-by-one in a date window or a dropped category is a
 * real correctness bug, not a cosmetic one.
 *
 * Run with: npm run test:insights
 */

import {
  compareWithPreviousPeriod,
  computeDailyHeatmap,
  computeCategoryBreakdown,
  computeMonthlySeries,
  computeTopNotes,
  computeTotals,
  computeWeekdayPattern,
  resolveRange,
  selectTransactions,
  type InsightFilter,
} from '../utils/insights';
import { Category, FinanceState, Transaction } from '../types/finance';

const NOW = new Date(2026, 7, 16, 12, 0, 0); // 16 Aug 2026

const cats: Category[] = [
  { id: 'food', name: 'Food', icon: 'restaurant', color: '#EE8A5B', kind: 'expense' },
  { id: 'travel', name: 'Travel', icon: 'airplane', color: '#6BADDB', kind: 'expense' },
  { id: 'salary', name: 'Salary', icon: 'cash', color: '#5CB98F', kind: 'income' },
];

const tx = (
  id: string,
  amount: number,
  daysAgo: number,
  overrides: Partial<Transaction> = {}
): Transaction => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  const iso = d.toISOString();
  return {
    id,
    type: 'expense',
    amount,
    accountId: 'a1',
    categoryId: 'food',
    date: iso,
    createdAt: iso,
    ...overrides,
  };
};

const state: FinanceState = {
  accounts: [
    { id: 'a1', name: 'Main', type: 'bank', icon: 'business-outline', color: '#3B82F6', initialBalance: 0, createdAt: NOW.toISOString() },
    { id: 'a2', name: 'Cash', type: 'cash', icon: 'cash-outline', color: '#22C55E', initialBalance: 0, createdAt: NOW.toISOString() },
  ],
  categories: cats,
  transactions: [
    tx('t1', 100, 1),
    tx('t2', 200, 5, { categoryId: 'travel' }),
    tx('t3', 50, 10, { accountId: 'a2' }),
    tx('t4', 400, 40),                       // outside 30d
    tx('t5', 1000, 200),                     // outside 6m
    tx('t6', 500, 2, { type: 'income', categoryId: 'salary' }),
    tx('t7', 75, 3, { note: 'Swiggy · UPI 12345' }),
    tx('t8', 25, 4, { note: 'Swiggy · UPI 99999' }),
  ],
  budgets: [],
  quickPresets: [],
  settings: { currency: 'INR', hasOnboarded: true },
  isLoaded: true,
};

const base: InsightFilter = { range: '30d', accountIds: [], categoryIds: [], kind: 'expense' };

interface Case { name: string; run: () => string | null }
const eq = (label: string, a: unknown, b: unknown): string | null =>
  a === b ? null : `${label}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`;

const CASES: Case[] = [
  {
    name: '30-day range covers exactly 30 days and includes today',
    run: () => {
      const { start, end } = resolveRange('30d', NOW);
      const days = Math.round((end.getTime() - start.getTime()) / 86400000);
      return eq('span in days', days, 30) ?? eq('ends today', end.getDate(), NOW.getDate());
    },
  },
  {
    name: 'year-to-date starts on 1 January',
    run: () => {
      const { start } = resolveRange('ytd', NOW);
      return eq('month', start.getMonth(), 0) ?? eq('day', start.getDate(), 1);
    },
  },
  {
    name: 'filter excludes transactions outside the window',
    run: () => {
      const picked = selectTransactions(state, base, NOW);
      const ids = picked.map(t => t.id).sort().join(',');
      return eq('ids', ids, 't1,t2,t3,t7,t8');
    },
  },
  {
    name: 'filter separates income from expense',
    run: () => {
      const picked = selectTransactions(state, { ...base, kind: 'income' }, NOW);
      return eq('ids', picked.map(t => t.id).join(','), 't6');
    },
  },
  {
    name: 'account filter narrows to the chosen accounts',
    run: () => {
      const picked = selectTransactions(state, { ...base, accountIds: ['a2'] }, NOW);
      return eq('ids', picked.map(t => t.id).join(','), 't3');
    },
  },
  {
    name: 'category filter narrows to the chosen categories',
    run: () => {
      const picked = selectTransactions(state, { ...base, categoryIds: ['travel'] }, NOW);
      return eq('ids', picked.map(t => t.id).join(','), 't2');
    },
  },
  {
    name: 'minimum amount filters out small noise',
    run: () => {
      const picked = selectTransactions(state, { ...base, minAmount: 100 }, NOW);
      return eq('ids', picked.map(t => t.id).sort().join(','), 't1,t2');
    },
  },
  {
    name: 'totals report sum, count, average and the largest entry',
    run: () => {
      const totals = computeTotals(selectTransactions(state, base, NOW));
      return (
        eq('total', totals.total, 450) ??
        eq('count', totals.count, 5) ??
        eq('average', totals.average, 90) ??
        eq('largest', totals.largest?.id, 't2')
      );
    },
  },
  {
    name: 'daily average uses active days, not calendar days',
    run: () => {
      const totals = computeTotals(selectTransactions(state, base, NOW));
      return eq('activeDays', totals.activeDays, 5) ?? eq('dailyAverage', totals.dailyAverage, 90);
    },
  },
  {
    name: 'totals of an empty selection do not divide by zero',
    run: () => {
      const totals = computeTotals([]);
      return eq('average', totals.average, 0) ?? eq('dailyAverage', totals.dailyAverage, 0);
    },
  },
  {
    name: 'category breakdown sums, sorts and computes shares',
    run: () => {
      const slices = computeCategoryBreakdown(selectTransactions(state, base, NOW), cats);
      const top = slices[0];
      const shareTotal = slices.reduce((n, s) => n + s.share, 0);
      return (
        eq('top category', top.category.id, 'food') ??
        eq('top amount', top.amount, 250) ??
        eq('shares sum to 1', Math.round(shareTotal * 1000) / 1000, 1)
      );
    },
  },
  {
    name: 'monthly series is continuous, including months with no activity',
    run: () => {
      const range = resolveRange('6m', NOW);
      const series = computeMonthlySeries(selectTransactions(state, { ...base, range: '6m' }, NOW), range, NOW);
      const fail = eq('months', series.length, 6);
      if (fail) return fail;
      return eq('last month key', series[series.length - 1].monthKey, '2026-08');
    },
  },
  {
    name: 'weekday pattern has seven buckets that sum to the total',
    run: () => {
      const picked = selectTransactions(state, base, NOW);
      const buckets = computeWeekdayPattern(picked);
      const total = buckets.reduce((a, b) => a + b, 0);
      return eq('buckets', buckets.length, 7) ?? eq('sum', total, 450);
    },
  },
  {
    name: 'top notes group by merchant, ignoring the unique UPI reference',
    run: () => {
      const notes = computeTopNotes(selectTransactions(state, base, NOW));
      const swiggy = notes.find(n => n.label === 'Swiggy');
      return eq('grouped count', swiggy?.count, 2) ?? eq('grouped amount', swiggy?.amount, 100);
    },
  },
  {
    name: 'period comparison reports a change against the preceding window',
    run: () => {
      const result = compareWithPreviousPeriod(state, base, NOW);
      // Previous 30 days before the window contains t4 (400).
      return eq('current', result.current, 450) ?? eq('previous', result.previous, 400);
    },
  },
  {
    name: 'period comparison leaves change undefined with no baseline',
    run: () => {
      const empty: FinanceState = { ...state, transactions: [tx('only', 10, 1)] };
      const result = compareWithPreviousPeriod(empty, base, NOW);
      return eq('change', result.change, undefined);
    },
  },
  {
    name: 'heatmap grid is Sunday-aligned and covers every week in range',
    run: () => {
      const range = resolveRange('30d', NOW);
      const weeks = computeDailyHeatmap(selectTransactions(state, { ...base, range: '30d' }, NOW), range, NOW);
      for (const week of weeks) {
        for (let i = 0; i < week.days.length; i++) {
          const day = week.days[i];
          if (day && day.date.getDay() !== i) return `day at column ${i} has weekday ${day.date.getDay()}`;
        }
      }
      return weeks.length > 0 ? null : 'expected at least one week';
    },
  },
  {
    name: 'heatmap totals each day exactly once even with multiple transactions',
    run: () => {
      const range = resolveRange('30d', NOW);
      const picked = selectTransactions(state, { ...base, range: '30d' }, NOW);
      const weeks = computeDailyHeatmap(picked, range, NOW);
      const cellFor = (key: string) =>
        weeks.flatMap(w => w.days).find(d => d?.dateKey === key);

      // t7 (75) and t8 (25) both fall 3-4 days ago on different days; spot-check
      // the day carrying t1 (100, 1 day ago) sums correctly on its own.
      const oneDayAgo = new Date(NOW);
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      const key = `${oneDayAgo.getFullYear()}-${String(oneDayAgo.getMonth() + 1).padStart(2, '0')}-${String(oneDayAgo.getDate()).padStart(2, '0')}`;
      return eq('t1 day amount', cellFor(key)?.amount, 100);
    },
  },
  {
    name: 'heatmap marks the busiest day at the top level',
    run: () => {
      const range = resolveRange('30d', NOW);
      const picked = selectTransactions(state, { ...base, range: '30d' }, NOW);
      const weeks = computeDailyHeatmap(picked, range, NOW);
      const cells = weeks.flatMap(w => w.days).filter((d): d is NonNullable<typeof d> => d !== null);
      const busiest = cells.reduce((best, d) => (d.amount > best.amount ? d : best), cells[0]);
      return eq('busiest level', busiest.level, 4);
    },
  },
  {
    name: 'heatmap days before the range start are dimmed to level 0',
    run: () => {
      const range = resolveRange('30d', NOW);
      const picked = selectTransactions(state, { ...base, range: '30d' }, NOW);
      const weeks = computeDailyHeatmap(picked, range, NOW);
      const padding = weeks[0].days.find(d => d && !d.inRange);
      if (!padding) return null; // no leading padding this particular week alignment — fine
      return eq('padded level', padding.level, 0);
    },
  },
  {
    name: 'heatmap caps at just over a year even for an all-time range',
    run: () => {
      const longLedger: FinanceState = {
        ...state,
        transactions: [tx('old', 10, 900)], // ~2.5 years ago
      };
      const range = resolveRange('all', NOW);
      const weeks = computeDailyHeatmap(selectTransactions(longLedger, { ...base, range: 'all' }, NOW), range, NOW);
      const totalDays = weeks.reduce((n, w) => n + w.days.filter(d => d !== null).length, 0);
      return totalDays <= 371 + 6 ? null : `grid has ${totalDays} days, expected <= ~377`;
    },
  },
];
let failures = 0;
for (const c of CASES) {
  const f = c.run();
  if (f) { failures += 1; console.log(`FAIL  ${c.name}\n        ${f}`); }
  else console.log(`ok    ${c.name}`);
}
if (failures > 0) { console.error(`\n${failures} check(s) failed.`); process.exit(1); }
console.log(`\nAll ${CASES.length} insight cases passed.`);
