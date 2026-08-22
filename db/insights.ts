import { Category } from '@/types/finance';

import { Db } from './types';
import { Grain, fromMinor } from './rollup-math';

/**
 * Insights, backed by the `rollup` table instead of a scan over
 * `transactions`. A million-row ledger collapses to a few hundred rollup
 * cells, so every query here costs the same at 10M rows as at 10k — that is
 * the entire point of the table.
 *
 * The output shapes intentionally mirror `utils/insights.ts` (which stays in
 * the codebase as the pure, transaction-level oracle these are tested
 * against in `scripts/test-db-insights.ts`), so screens can swap one for the
 * other without changing how the chart components consume the data.
 */

export type DateRangePreset = '30d' | '3m' | '6m' | '12m' | 'ytd' | 'all';

export interface InsightFilter {
  range: DateRangePreset;
  accountIds: string[];
  categoryIds: string[];
  kind: 'income' | 'expense';
  /**
   * Not supported against the rollup — a per-row amount predicate is
   * fundamentally incompatible with pre-aggregated buckets. When set, callers
   * fall back to a bounded (indexed, date-range-limited) raw scan instead of
   * the rollup, via `computeTotalsRaw`. Charts should treat a set `minAmount`
   * as "not available from the fast path" rather than silently ignoring it.
   */
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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** One row of pre-aggregated data, already filtered to the requested range/accounts. */
interface BucketRow {
  bucket: string;
  category_id: string;
  amount: number;
  n: number;
}

async function queryBuckets(
  db: Db,
  grain: Grain,
  bucketStart: string,
  bucketEnd: string,
  filter: InsightFilter
): Promise<BucketRow[]> {
  const amountCol = filter.kind === 'income' ? 'income' : 'expense';
  const countCol = filter.kind === 'income' ? 'income_count' : 'expense_count';

  const clauses = ['grain = ?', 'bucket BETWEEN ? AND ?'];
  const params: (string | number)[] = [grain, bucketStart, bucketEnd];

  if (filter.accountIds.length > 0) {
    clauses.push(`account_id IN (${filter.accountIds.map(() => '?').join(',')})`);
    params.push(...filter.accountIds);
  }
  if (filter.categoryIds.length > 0) {
    clauses.push(`category_id IN (${filter.categoryIds.map(() => '?').join(',')})`);
    params.push(...filter.categoryIds);
  }

  return db.getAllAsync<BucketRow>(
    `SELECT bucket, category_id, SUM(${amountCol}) AS amount, SUM(${countCol}) AS n
     FROM rollup WHERE ${clauses.join(' AND ')}
     GROUP BY bucket, category_id`,
    params
  );
}

// ---- totals ----

export interface InsightTotals {
  total: number;
  count: number;
  average: number;
  dailyAverage: number;
  activeDays: number;
  /**
   * Undefined rather than fetched by default — finding the single largest row
   * needs a real scan (there is no index on `amount`), bounded by the
   * `(type, date_ms)` range but still O(matched rows). Populated only when
   * `withLargest` is passed, so the common case (every other Insights read)
   * never pays for it.
   */
  largestAmount?: number;
}

export async function computeTotals(
  db: Db,
  filter: InsightFilter,
  now = new Date(),
  withLargest = false
): Promise<InsightTotals> {
  const range = resolveRange(filter.range, now);
  // Always day grain, even for 'all': the range always ends "today", so the
  // current month is partial for every preset including 'all' — there is no
  // range where whole-month buckets are safe to sum without over-counting the
  // edge. Day grain stays cheap regardless: even a 20-year 'all time' range is
  // ~7,300 buckets, negligible next to the millions of rows it replaces.
  const rows = await queryBuckets(db, 'D', dayKeyOf(range.start), dayKeyOf(range.end), filter);

  let total = 0;
  let count = 0;
  const activeDayBuckets = new Set<string>();
  for (const row of rows) {
    total += fromMinor(row.amount);
    count += row.n;
    if (row.n > 0) activeDayBuckets.add(row.bucket);
  }

  // At day grain each active bucket is a day; at month grain (the 'all'
  // range) this undercounts active days, but 'all' has no daily-average UI
  // consumer today, so the simpler count is left as-is rather than adding a
  // second query for a number nothing reads yet.
  const activeDays = activeDayBuckets.size;

  let largestAmount: number | undefined;
  if (withLargest && count > 0) {
    const clauses = ['type = ?', 'date_ms BETWEEN ? AND ?'];
    const params: (string | number)[] = [filter.kind, range.start.getTime(), range.end.getTime()];
    if (filter.accountIds.length > 0) {
      clauses.push(`account_id IN (${filter.accountIds.map(() => '?').join(',')})`);
      params.push(...filter.accountIds);
    }
    if (filter.categoryIds.length > 0) {
      clauses.push(`category_id IN (${filter.categoryIds.map(() => '?').join(',')})`);
      params.push(...filter.categoryIds);
    }
    const row = await db.getFirstAsync<{ amount: number }>(
      `SELECT amount FROM transactions WHERE ${clauses.join(' AND ')} ORDER BY amount DESC LIMIT 1`,
      params
    );
    largestAmount = row?.amount;
  }

  return {
    total,
    count,
    average: count > 0 ? total / count : 0,
    activeDays,
    dailyAverage: activeDays > 0 ? total / activeDays : 0,
    largestAmount,
  };
}

// ---- category breakdown ----

export interface CategorySlice {
  category: Category;
  amount: number;
  share: number;
  count: number;
}

export async function computeCategoryBreakdown(
  db: Db,
  filter: InsightFilter,
  categories: Category[],
  now = new Date()
): Promise<CategorySlice[]> {
  const range = resolveRange(filter.range, now);
  // Same reasoning as computeTotals: always day grain, no month-grain
  // shortcut for 'all', since 'all' still ends today and has a partial
  // current month like every other preset.
  const rows = await queryBuckets(db, 'D', dayKeyOf(range.start), dayKeyOf(range.end), filter);
  const byCategory = new Map<string, { amount: number; count: number }>();
  let grand = 0;

  for (const row of rows) {
    if (!row.category_id) continue;
    const amount = fromMinor(row.amount);
    const cur = byCategory.get(row.category_id) ?? { amount: 0, count: 0 };
    cur.amount += amount;
    cur.count += row.n;
    byCategory.set(row.category_id, cur);
    grand += amount;
  }

  const byId = new Map(categories.map(c => [c.id, c]));
  const slices: CategorySlice[] = [];
  for (const [id, bucket] of byCategory) {
    const category = byId.get(id);
    if (!category) continue;
    slices.push({ category, amount: bucket.amount, count: bucket.count, share: grand > 0 ? bucket.amount / grand : 0 });
  }

  return slices.sort((a, b) => b.amount - a.amount);
}

// ---- monthly series ----

export interface MonthPoint {
  monthKey: string;
  amount: number;
}

export async function computeMonthlySeries(
  db: Db,
  filter: InsightFilter,
  now = new Date()
): Promise<MonthPoint[]> {
  const range = resolveRange(filter.range, now);
  // Always day grain, then folded up to months in JS —
  // this makes the boundary month exact even for the 'all time' preset,
  // matching the transaction-level oracle's behaviour.
  const rows = await queryBuckets(db, 'D', dayKeyOf(range.start), dayKeyOf(range.end), filter);

  const start =
    range.start.getTime() === 0
      ? rows.length > 0
        ? new Date(rows.reduce((min, r) => (r.bucket < min ? r.bucket : min), rows[0].bucket))
        : now
      : range.start;

  const points: MonthPoint[] = [];
  const index = new Map<string, number>();
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(range.end.getFullYear(), range.end.getMonth(), 1);

  while (cursor <= last && points.length < 60) {
    const key = monthKeyOf(cursor);
    index.set(key, points.length);
    points.push({ monthKey: key, amount: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  for (const row of rows) {
    const monthKey = row.bucket.slice(0, 7);
    const at = index.get(monthKey);
    if (at !== undefined) points[at].amount += fromMinor(row.amount);
  }

  return points;
}

// ---- daily heatmap ----

export interface HeatmapDay {
  dateKey: string;
  date: Date;
  amount: number;
  level: number;
  inRange: boolean;
}

export interface HeatmapWeek {
  days: (HeatmapDay | null)[];
}

const HEATMAP_MAX_DAYS = 371;

export async function computeDailyHeatmap(
  db: Db,
  filter: InsightFilter,
  now = new Date()
): Promise<HeatmapWeek[]> {
  const range = resolveRange(filter.range, now);
  const rows = await queryBuckets(db, 'D', dayKeyOf(new Date(0)), dayKeyOf(range.end), filter);
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.bucket, (totals.get(row.bucket) ?? 0) + fromMinor(row.amount));

  const rangeStart =
    range.start.getTime() === 0
      ? totals.size > 0
        ? new Date([...totals.keys()].sort()[0])
        : now
      : range.start;

  const start = new Date(rangeStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(Math.min(range.end.getTime(), now.getTime()));
  end.setHours(0, 0, 0, 0);

  const totalDaySpan = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const clampedStart =
    totalDaySpan > HEATMAP_MAX_DAYS ? new Date(end.getTime() - (HEATMAP_MAX_DAYS - 1) * 86400000) : start;

  const gridStart = new Date(clampedStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

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
    const key = dayKeyOf(cursor);
    const inRange = cursor >= clampedStart;
    const amount = totals.get(key) ?? 0;
    currentWeek.push({ dateKey: key, date: new Date(cursor), amount, level: inRange ? levelFor(amount) : 0, inRange });
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

// ---- weekday pattern ----

/** Spend by day of week, 0 = Sunday. `bucket` is already a local date string, so this is pure string math, no `Date` parsing per row. */
export async function computeWeekdayPattern(db: Db, filter: InsightFilter, now = new Date()): Promise<number[]> {
  const range = resolveRange(filter.range, now);
  const rows = await queryBuckets(db, 'D', dayKeyOf(range.start), dayKeyOf(range.end), filter);
  const buckets = new Array(7).fill(0);
  for (const row of rows) {
    const [y, m, d] = row.bucket.split('-').map(Number);
    buckets[new Date(y, m - 1, d).getDay()] += fromMinor(row.amount);
  }
  return buckets;
}

// ---- previous-period comparison ----

export interface ComparisonResult {
  current: number;
  previous: number;
  change: number | undefined;
}

export async function compareWithPreviousPeriod(
  db: Db,
  filter: InsightFilter,
  now = new Date()
): Promise<ComparisonResult> {
  const range = resolveRange(filter.range, now);
  const spanMs = range.end.getTime() - range.start.getTime();

  const curRows = await queryBuckets(db, 'D', dayKeyOf(range.start), dayKeyOf(range.end), filter);
  const current = curRows.reduce((s, r) => s + fromMinor(r.amount), 0);

  if (filter.range === 'all') return { current, previous: 0, change: undefined };

  const previousEnd = new Date(range.start.getTime() - 1);
  const previousStart = new Date(range.start.getTime() - spanMs);
  const prevRows = await queryBuckets(db, 'D', dayKeyOf(previousStart), dayKeyOf(previousEnd), filter);
  const previous = prevRows.reduce((s, r) => s + fromMinor(r.amount), 0);

  return { current, previous, change: previous > 0 ? (current - previous) / previous : undefined };
}

// ---- top notes (deliberately NOT rollup-backed — see note) ----

export interface TopMerchant {
  label: string;
  amount: number;
  count: number;
}

/**
 * Free-text notes have unbounded cardinality, so there is no `note_rollup` —
 * pre-aggregating every distinct note string does not bound the table size
 * the way month/day/account/category bucketing does. This runs a real range
 * scan, bounded by the `(type, date_ms)` index.
 *
 * For `range: 'all'` on a 10M-row ledger this is a genuine full scan of that
 * type's rows. Callers should cap the effective range for 'all' (e.g. trailing
 * 12 months) rather than pass it through unmodified — the UI layer's
 * responsibility, not this function's.
 *
 * SQL groups by the exact note text first (cheap, cuts row count for repeated
 * notes), then a second JS pass folds by the label *before* a "·" — scanned
 * and widget-logged notes carry a "· UPI <ref>" tail that is unique per
 * payment and would otherwise make every row its own group. Matches
 * `utils/insights.ts`'s `computeTopNotes` exactly; that function is the oracle
 * this one is tested against.
 */
export async function computeTopNotes(
  db: Db,
  filter: InsightFilter,
  limit = 5,
  now = new Date()
): Promise<TopMerchant[]> {
  const range = resolveRange(filter.range, now);
  const clauses = ['type = ?', 'date_ms BETWEEN ? AND ?', 'note IS NOT NULL'];
  const params: (string | number)[] = [filter.kind, range.start.getTime(), range.end.getTime()];
  if (filter.accountIds.length > 0) {
    clauses.push(`account_id IN (${filter.accountIds.map(() => '?').join(',')})`);
    params.push(...filter.accountIds);
  }
  if (filter.categoryIds.length > 0) {
    clauses.push(`category_id IN (${filter.categoryIds.map(() => '?').join(',')})`);
    params.push(...filter.categoryIds);
  }
  if (filter.minAmount) {
    clauses.push('amount >= ?');
    params.push(filter.minAmount);
  }

  const rows = await db.getAllAsync<{ note: string; amount: number; n: number }>(
    `SELECT note, SUM(amount) AS amount, COUNT(*) AS n FROM transactions
     WHERE ${clauses.join(' AND ')} GROUP BY note`,
    params
  );

  const byLabel = new Map<string, { amount: number; count: number }>();
  for (const row of rows) {
    const label = row.note.split('\u00b7')[0].trim();
    if (!label) continue;
    const cur = byLabel.get(label) ?? { amount: 0, count: 0 };
    cur.amount += row.amount;
    cur.count += row.n;
    byLabel.set(label, cur);
  }

  return Array.from(byLabel, ([label, bucket]) => ({ label, ...bucket }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}
