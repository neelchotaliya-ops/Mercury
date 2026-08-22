/**
 * Analytics behind the Insights screen.
 *
 * Everything here takes an explicit filter and returns plain data, with no
 * React and no formatting, so the numbers can be tested directly and the
 * charts stay dumb. Each function makes a single pass over the ledger — this
 * screen can have several charts on it at once, and re-scanning per chart is
 * what made earlier versions stutter.
 */

import { Category, FinanceState, Transaction, TransactionType } from '@/types/finance';
import { dayKeyOf, monthKeyOf } from '@/utils/date';

/**
 * The only part of the store these functions actually read.
 *
 * Taking the whole `FinanceState` meant callers had to depend on the entire
 * state object, whose identity changes on any mutation — so an unrelated
 * settings toggle re-ran a full ledger scan. Narrowing the parameter lets the
 * Insights screen memoize on `state.transactions` alone, and makes that
 * dependency structural rather than something asserted in a dep array.
 */
export type LedgerSlice = Pick<FinanceState, 'transactions'>;

export type DateRangePreset = '30d' | '3m' | '6m' | '12m' | 'ytd' | 'all';

export interface InsightFilter {
  range: DateRangePreset;
  /** Empty means every account. */
  accountIds: string[];
  /** Empty means every category. */
  categoryIds: string[];
  kind: Extract<TransactionType, 'income' | 'expense'>;
  /** Ignore transactions below this amount; useful for hiding noise. */
  minAmount?: number;
}

export const DEFAULT_INSIGHT_FILTER: InsightFilter = {
  range: '6m',
  accountIds: [],
  categoryIds: [],
  kind: 'expense',
};

export interface DateRange {
  start: Date;
  end: Date;
}

/** Resolves a preset to a concrete range, inclusive of today. */
export function resolveRange(preset: DateRangePreset, now: Date = new Date()): DateRange {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (preset) {
    case '30d': {
      const start = new Date(end);
      start.setDate(start.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      return { start, end };
    }
    case '3m':
      return { start: new Date(now.getFullYear(), now.getMonth() - 2, 1), end };
    case '6m':
      return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end };
    case '12m':
      return { start: new Date(now.getFullYear(), now.getMonth() - 11, 1), end };
    case 'ytd':
      return { start: new Date(now.getFullYear(), 0, 1), end };
    case 'all':
      return { start: new Date(0), end };
  }
}

export const RANGE_LABELS: Record<DateRangePreset, string> = {
  '30d': '30 days',
  '3m': '3 months',
  '6m': '6 months',
  '12m': '12 months',
  ytd: 'This year',
  all: 'All time',
};

/**
 * Applies a filter once. Every other function here works off the result, so
 * the ledger is scanned a single time per render regardless of chart count.
 */
export function selectTransactions(
  state: LedgerSlice,
  filter: InsightFilter,
  now: Date = new Date()
): Transaction[] {
  const { start, end } = resolveRange(filter.range, now);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const accountFilter = filter.accountIds.length > 0 ? new Set(filter.accountIds) : null;
  const categoryFilter = filter.categoryIds.length > 0 ? new Set(filter.categoryIds) : null;
  const min = filter.minAmount ?? 0;

  const out: Transaction[] = [];
  for (const t of state.transactions) {
    if (t.type !== filter.kind) continue;
    if (t.amount < min) continue;
    if (accountFilter && !accountFilter.has(t.accountId)) continue;
    if (categoryFilter && (!t.categoryId || !categoryFilter.has(t.categoryId))) continue;

    const ms = Date.parse(t.date);
    if (ms < startMs || ms > endMs) continue;

    out.push(t);
  }
  return out;
}

export interface InsightTotals {
  total: number;
  count: number;
  average: number;
  largest: Transaction | undefined;
  /** Mean per active day, which reads more usefully than a raw total. */
  dailyAverage: number;
  activeDays: number;
}

export function computeTotals(transactions: Transaction[]): InsightTotals {
  let total = 0;
  let largest: Transaction | undefined;
  const days = new Set<string>();

  for (const t of transactions) {
    total += t.amount;
    days.add(dayKeyOf(t.date));
    if (!largest || t.amount > largest.amount) largest = t;
  }

  const count = transactions.length;
  const activeDays = days.size;

  return {
    total,
    count,
    average: count > 0 ? total / count : 0,
    largest,
    activeDays,
    dailyAverage: activeDays > 0 ? total / activeDays : 0,
  };
}

export interface CategorySlice {
  category: Category;
  amount: number;
  share: number;
  count: number;
}

export function computeCategoryBreakdown(
  transactions: Transaction[],
  categories: Category[]
): CategorySlice[] {
  const totals = new Map<string, { amount: number; count: number }>();
  let grand = 0;

  for (const t of transactions) {
    if (!t.categoryId) continue;
    const bucket = totals.get(t.categoryId) ?? { amount: 0, count: 0 };
    bucket.amount += t.amount;
    bucket.count += 1;
    totals.set(t.categoryId, bucket);
    grand += t.amount;
  }

  const byId = new Map(categories.map(c => [c.id, c]));
  const slices: CategorySlice[] = [];

  for (const [id, bucket] of totals) {
    const category = byId.get(id);
    if (!category) continue;
    slices.push({
      category,
      amount: bucket.amount,
      count: bucket.count,
      share: grand > 0 ? bucket.amount / grand : 0,
    });
  }

  return slices.sort((a, b) => b.amount - a.amount);
}

export interface MonthPoint {
  monthKey: string;
  amount: number;
}

/** Continuous month series, including months with no activity. */
export function computeMonthlySeries(
  transactions: Transaction[],
  range: DateRange,
  now: Date = new Date()
): MonthPoint[] {
  const start = range.start.getTime() === 0 ? earliest(transactions) ?? now : range.start;

  const points: MonthPoint[] = [];
  const index = new Map<string, number>();

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(range.end.getFullYear(), range.end.getMonth(), 1);

  // Cap the series so an "all time" range on an old ledger cannot produce a
  // chart with hundreds of columns.
  while (cursor <= last && points.length < 60) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    index.set(key, points.length);
    points.push({ monthKey: key, amount: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const t of transactions) {
    const at = index.get(monthKeyOf(t.date));
    if (at !== undefined) points[at].amount += t.amount;
  }

  return points;
}

function earliest(transactions: Transaction[]): Date | undefined {
  let min: string | undefined;
  for (const t of transactions) {
    if (min === undefined || t.date < min) min = t.date;
  }
  return min ? new Date(min) : undefined;
}

export interface HeatmapDay {
  /** YYYY-MM-DD, local time. */
  dateKey: string;
  date: Date;
  amount: number;
  /** 0-4: 0 is always "no activity"; 1-4 are quartered against the range's own max. */
  level: number;
  inRange: boolean;
}

export interface HeatmapWeek {
  days: (HeatmapDay | null)[];
}

const HEATMAP_MAX_DAYS = 371; // a little over 52 weeks, so a full year still fits one grid

/**
 * Daily totals laid out as calendar weeks (Sunday-start), the shape a
 * GitHub-style contribution grid needs. Capped like the monthly series is, so
 * an "all time" range on an old ledger can't produce an unbounded grid.
 *
 * Levels are quartered against this range's own busiest day rather than a
 * fixed currency threshold — a student's ledger and a business's should each
 * light up their own heaviest days, not be judged against the other's scale.
 */
export function computeDailyHeatmap(
  transactions: Transaction[],
  range: DateRange,
  now: Date = new Date()
): HeatmapWeek[] {
  const rangeStart = range.start.getTime() === 0 ? earliest(transactions) ?? now : range.start;

  const start = new Date(rangeStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(Math.min(range.end.getTime(), now.getTime()));
  end.setHours(0, 0, 0, 0);

  const totalDaySpan = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const clampedStart =
    totalDaySpan > HEATMAP_MAX_DAYS
      ? new Date(end.getTime() - (HEATMAP_MAX_DAYS - 1) * 86400000)
      : start;

  // Sunday-align so the grid always reads as complete weeks.
  const gridStart = new Date(clampedStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const totals = new Map<string, number>();
  for (const t of transactions) {
    const key = dayKeyOf(t.date);
    totals.set(key, (totals.get(key) ?? 0) + t.amount);
  }

  const maxAmount = Math.max(...totals.values(), 0);

  const levelFor = (amount: number): number => {
    if (amount <= 0 || maxAmount <= 0) return 0;
    const ratio = amount / maxAmount;
    if (ratio > 0.75) return 4;
    if (ratio > 0.5) return 3;
    if (ratio > 0.25) return 2;
    return 1;
  };

  const weeks: HeatmapWeek[] = [];
  let cursor = new Date(gridStart);
  let currentWeek: (HeatmapDay | null)[] = [];

  while (cursor <= end) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
      cursor.getDate()
    ).padStart(2, '0')}`;
    const inRange = cursor >= clampedStart;
    const amount = totals.get(key) ?? 0;

    currentWeek.push({
      dateKey: key,
      date: new Date(cursor),
      amount,
      level: inRange ? levelFor(amount) : 0,
      inRange,
    });

    if (currentWeek.length === 7) {
      weeks.push({ days: currentWeek });
      currentWeek = [];
    }
    cursor = new Date(cursor.getTime() + 86400000);
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push({ days: currentWeek });
  }

  return weeks;
}

/** Spend by day of week, 0 = Sunday. Reveals weekend-vs-weekday habits. */
export function computeWeekdayPattern(transactions: Transaction[]): number[] {
  const buckets = new Array(7).fill(0);
  for (const t of transactions) {
    buckets[new Date(t.date).getDay()] += t.amount;
  }
  return buckets;
}

export interface TopMerchant {
  label: string;
  amount: number;
  count: number;
}

/**
 * Groups by note text, which is where the merchant ends up for scanned and
 * widget-logged transactions.
 */
export function computeTopNotes(transactions: Transaction[], limit = 5): TopMerchant[] {
  const totals = new Map<string, { amount: number; count: number }>();

  for (const t of transactions) {
    const note = t.note?.trim();
    if (!note) continue;
    // Scanned notes carry a "· UPI <ref>" tail that is unique per payment and
    // would otherwise make every row its own group.
    const label = note.split('·')[0].trim();
    if (!label) continue;
    const bucket = totals.get(label) ?? { amount: 0, count: 0 };
    bucket.amount += t.amount;
    bucket.count += 1;
    totals.set(label, bucket);
  }

  return Array.from(totals, ([label, bucket]) => ({ label, ...bucket }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export interface ComparisonResult {
  current: number;
  previous: number;
  /** Fractional change; undefined when there is no baseline to compare to. */
  change: number | undefined;
}

/** Compares the selected window against the one immediately before it. */
export function compareWithPreviousPeriod(
  state: LedgerSlice,
  filter: InsightFilter,
  now: Date = new Date()
): ComparisonResult {
  const { start, end } = resolveRange(filter.range, now);
  const spanMs = end.getTime() - start.getTime();

  const current = sum(selectTransactions(state, filter, now));

  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(start.getTime() - spanMs);

  let previous = 0;
  const accountFilter = filter.accountIds.length > 0 ? new Set(filter.accountIds) : null;
  const categoryFilter = filter.categoryIds.length > 0 ? new Set(filter.categoryIds) : null;

  for (const t of state.transactions) {
    if (t.type !== filter.kind) continue;
    if (accountFilter && !accountFilter.has(t.accountId)) continue;
    if (categoryFilter && (!t.categoryId || !categoryFilter.has(t.categoryId))) continue;
    const ms = Date.parse(t.date);
    if (ms < previousStart.getTime() || ms > previousEnd.getTime()) continue;
    previous += t.amount;
  }

  return {
    current,
    previous,
    change: previous > 0 ? (current - previous) / previous : undefined,
  };
}

function sum(transactions: Transaction[]): number {
  let total = 0;
  for (const t of transactions) total += t.amount;
  return total;
}
