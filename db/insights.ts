import { Category, Subcategory } from '@/types/finance';

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

/**
 * The cap used by `computeTotals`'s `largestAmount` and `computeTopNotes` —
 * the two Insights queries that have no rollup to answer from and fall back
 * to a raw scan over `transactions`. Both bound that scan to the most
 * recent N matches (an index-ordered read on `date_ms`, not a full sort)
 * rather than every row the filter could match, so their cost stays
 * constant instead of growing with the ledger. See each function's comment
 * for why this trade — "among the most recent N", not exhaustive — is the
 * right one for what these two answer.
 */
export const UNAGGREGATED_SCAN_CAP = 20_000;

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
   * Undefined rather than fetched by default — finding the largest row needs
   * a real scan (there is no index on `amount`), capped to the most recent
   * `UNAGGREGATED_SCAN_CAP` matches so it costs the same regardless of
   * ledger size. Populated only when `withLargest` is passed, so the common
   * case (every other Insights read) never pays for it.
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
    // `ORDER BY amount DESC LIMIT 1` alone has no index to lean on for the
    // sort — SQLite narrows by the WHERE clause using idx_tx_type_date (or
    // idx_tx_acct_date/idx_tx_cat_date) but then has to sort every matched
    // row by amount, which is O(matched rows): fine for a filtered month,
    // a real scan for 'all time' over a multi-million-row ledger. Bounding
    // the candidate set to the most recent UNAGGREGATED_SCAN_CAP matches (an
    // index-ordered scan on date_ms, no sort needed to apply that LIMIT)
    // before taking MAX caps the cost at a constant regardless of ledger
    // size — this is "largest among the most recent N matches" rather than
    // an exhaustive all-time max, which is the same trade `computeTopNotes`
    // below makes for the same reason.
    const row = await db.getFirstAsync<{ amount: number }>(
      `SELECT MAX(amount) AS amount FROM (
         SELECT amount FROM transactions WHERE ${clauses.join(' AND ')}
         ORDER BY date_ms DESC LIMIT ${UNAGGREGATED_SCAN_CAP}
       )`,
      params
    );
    largestAmount = row?.amount ?? undefined;
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

// ---- subcategory breakdown ----

export interface SubcategorySlice {
  /** Null represents the "No subcategory" bucket — transactions in this
   * category that were never tagged with one. */
  subcategory: Subcategory | null;
  amount: number;
  share: number;
  count: number;
}

/**
 * Breaks a single, already-selected category down by subcategory.
 *
 * Unlike `computeCategoryBreakdown`, this can't read from `rollup` —
 * `subcategory_id` is deliberately not part of the rollup's key (see the v3
 * migration comment in db/schema.ts). So this does a bounded raw scan over
 * `transactions` instead, scoped to one `category_id` and the resolved date
 * range — the "subcategory/payee filtering uses bounded raw scans" contract
 * that comment documents. It only ever runs for one category a user has
 * already drilled into, never the whole ledger, so the scan stays cheap
 * regardless of how many transactions or categories exist overall.
 */
export async function computeSubcategoryBreakdown(
  db: Db,
  filter: InsightFilter,
  categoryId: string,
  subcategories: Subcategory[],
  now = new Date()
): Promise<SubcategorySlice[]> {
  const range = resolveRange(filter.range, now);
  const clauses = ['type = ?', 'category_id = ?', 'date_ms BETWEEN ? AND ?'];
  const params: (string | number)[] = [filter.kind, categoryId, range.start.getTime(), range.end.getTime()];
  if (filter.accountIds.length > 0) {
    clauses.push(`account_id IN (${filter.accountIds.map(() => '?').join(',')})`);
    params.push(...filter.accountIds);
  }

  // transactions.amount is stored in major units already (unlike rollup's
  // minor-unit columns), so no fromMinor conversion is needed here.
  const rows = await db.getAllAsync<{ subcategory_id: string | null; amount: number; n: number }>(
    `SELECT subcategory_id, SUM(amount) AS amount, COUNT(*) AS n
     FROM transactions WHERE ${clauses.join(' AND ')}
     GROUP BY subcategory_id`,
    params
  );

  const byId = new Map(
    subcategories.filter(s => s.categoryId === categoryId).map(s => [s.id, s])
  );

  let grand = 0;
  const slices: SubcategorySlice[] = rows.map(row => {
    grand += row.amount;
    return {
      subcategory: row.subcategory_id ? byId.get(row.subcategory_id) ?? null : null,
      amount: row.amount,
      count: row.n,
      share: 0,
    };
  });
  for (const slice of slices) slice.share = grand > 0 ? slice.amount / grand : 0;

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

  // `GROUP BY note` over the raw WHERE match is O(matched rows) — free-text
  // grouping has no rollup to answer from, same as `computeTotals`'s
  // `largestAmount` above. Bounding the pre-group candidate set to the most
  // recent UNAGGREGATED_SCAN_CAP matches (an index-ordered read on
  // `date_ms`) keeps this "top merchants among your most recent activity"
  // rather than an exhaustive all-time tally, and caps the cost at a
  // constant regardless of ledger size.
  const rows = await db.getAllAsync<{ note: string; amount: number; n: number }>(
    `SELECT note, SUM(amount) AS amount, COUNT(*) AS n FROM (
       SELECT note, amount FROM transactions WHERE ${clauses.join(' AND ')}
       ORDER BY date_ms DESC LIMIT ${UNAGGREGATED_SCAN_CAP}
     ) GROUP BY note`,
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

// ---- Recurring Insights -----------------------------------------------------

export interface RecurringInsights {
  monthlyTotal: number;
  yearlyTotal: number;
  activeCount: number;
  rules: import('@/types/finance').RecurringRule[];
  upcomingNext30Days: import('./recurring').UpcomingPayment[];
}

export async function getRecurringInsights(
  db: Db,
  now: Date = new Date()
): Promise<RecurringInsights> {
  const { listActiveRecurringRules, getUpcomingPayments } = await import('./recurring');
  const rules = await listActiveRecurringRules(db);

  let monthlyTotal = 0;
  for (const r of rules) {
    if (r.type !== 'expense') continue;
    switch (r.frequency) {
      case 'daily':   monthlyTotal += r.amount * 30; break;
      case 'weekly':  monthlyTotal += r.amount * 4.33; break;
      case 'monthly': monthlyTotal += r.amount; break;
      case 'yearly':  monthlyTotal += r.amount / 12; break;
      case 'custom': {
        const val = r.intervalValue || 1;
        switch (r.intervalUnit) {
          case 'day':   monthlyTotal += (r.amount / val) * 30; break;
          case 'week':  monthlyTotal += (r.amount / val) * 4.33; break;
          case 'month': monthlyTotal += r.amount / val; break;
          case 'year':  monthlyTotal += r.amount / (val * 12); break;
        }
        break;
      }
    }
  }

  const upcomingNext30Days = getUpcomingPayments(rules, now, 10, 30);

  return {
    monthlyTotal: Math.round(monthlyTotal * 100) / 100,
    yearlyTotal: Math.round(monthlyTotal * 12 * 100) / 100,
    activeCount: rules.length,
    rules,
    upcomingNext30Days,
  };
}

// ---- Split Insights ---------------------------------------------------------

export interface SplitInsights {
  totalOwed: number;
  totalSettled: number;
  pendingCount: number;
  unsettledSplits: Array<{
    transactionId: string;
    participants: import('@/types/finance').SplitParticipant[];
    outstanding: number;
  }>;
}

export async function getSplitInsights(db: Db): Promise<SplitInsights> {
  const { getSplitSummary, listUnsettledSplits } = await import('./splits');
  const [summary, unsettledSplits] = await Promise.all([
    getSplitSummary(db),
    listUnsettledSplits(db),
  ]);

  return {
    ...summary,
    unsettledSplits,
  };
}

