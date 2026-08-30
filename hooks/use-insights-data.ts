import {
  InsightFilter,
  AllInsightsResult,
  computeAllInsights,
} from '@/db/insights';
import { Category } from '@/types/finance';
import { useDbQuery } from './use-db-query';

const INITIAL: AllInsightsResult = {
  totals: { total: 0, count: 0, average: 0, dailyAverage: 0, activeDays: 0 },
  breakdown: [],
  series: [],
  heatmap: [],
  weekdays: [0, 0, 0, 0, 0, 0, 0],
  topNotes: [],
  comparison: { current: 0, previous: 0, change: undefined },
};

/**
 * All Insights chart data in a single DB query → single render update.
 *
 * Previous implementation used seven separate `useDbQuery` hooks, each running
 * its own async effect and triggering its own `setState` — that meant seven
 * cascading re-renders and seven separate roundtrips to the same rollup table.
 * Now everything resolves in one batched call: one `queryBuckets` read shared
 * across four computations, remaining independent queries run via
 * `Promise.all`, and one `setState` at the end.
 */
export function useInsightsData(filter: InsightFilter, categories: Category[]) {
  const key = JSON.stringify(filter) + categories.length;

  const { data, loading } = useDbQuery<AllInsightsResult>(
    key,
    db => computeAllInsights(db, filter, categories),
    INITIAL
  );

  return { ...data, loading };
}
