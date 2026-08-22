import {
  InsightFilter,
  computeTotals,
  computeCategoryBreakdown,
  computeMonthlySeries,
  computeDailyHeatmap,
  computeWeekdayPattern,
  computeTopNotes,
  compareWithPreviousPeriod,
} from '@/db/insights';
import { Category } from '@/types/finance';
import { useDbQuery } from './use-db-query';

/**
 * Every Insights chart's data, one hook per query, all backed by the rollup.
 * Each is independently cheap (O(buckets) in the filtered range, not
 * O(ledger)), so issuing six of them per render is not the problem full
 * ledger scans used to be.
 */
export function useInsightsData(filter: InsightFilter, categories: Category[]) {
  const key = JSON.stringify(filter);

  const totals = useDbQuery(key, db => computeTotals(db, filter, new Date(), true), {
    total: 0, count: 0, average: 0, dailyAverage: 0, activeDays: 0,
  });
  const breakdown = useDbQuery(
    key + categories.length,
    db => computeCategoryBreakdown(db, filter, categories),
    []
  );
  const series = useDbQuery(key, db => computeMonthlySeries(db, filter), []);
  const heatmap = useDbQuery(key, db => computeDailyHeatmap(db, filter), []);
  const weekdays = useDbQuery(key, db => computeWeekdayPattern(db, filter), [0, 0, 0, 0, 0, 0, 0]);
  const topNotes = useDbQuery(key, db => computeTopNotes(db, filter), []);
  const comparison = useDbQuery(key, db => compareWithPreviousPeriod(db, filter), {
    current: 0, previous: 0, change: undefined,
  });

  return {
    totals: totals.data,
    breakdown: breakdown.data,
    series: series.data,
    heatmap: heatmap.data,
    weekdays: weekdays.data,
    topNotes: topNotes.data,
    comparison: comparison.data,
    loading: totals.loading || breakdown.loading || series.loading || heatmap.loading,
  };
}
