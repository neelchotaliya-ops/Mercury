import { getLedgerStat, countAndSumFiltered, TransactionFilter } from '@/db/transactions';
import { TransactionType } from '@/types/finance';
import { useDbQuery } from './use-db-query';

/**
 * Activity's "N entries · X net" header, O(1) via `ledger_stat` on the
 * unfiltered path and a bounded indexed scan when a search needle is active
 * (free-text search has no pre-aggregate to answer from — see
 * `db/insights.ts`'s note on `computeTopNotes` for the same tradeoff).
 */
export function useLedgerHeader(filterType: 'all' | TransactionType, needle: string, categoryIds: string[]) {
  const hasSearch = needle.trim().length > 0;
  const key = `${filterType}|${needle}|${categoryIds.join(',')}`;

  return useDbQuery(
    key,
    async db => {
      if (!hasSearch) {
        return getLedgerStat(db, filterType);
      }
      const filter: TransactionFilter = {
        type: filterType === 'all' ? undefined : filterType,
        search: { needle: needle.trim().toLowerCase(), categoryIds },
      };
      return countAndSumFiltered(db, filter);
    },
    { n: 0, net: 0 }
  );
}
