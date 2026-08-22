import { getBudgetProgress } from '@/db/entities';
import { useDbQuery } from './use-db-query';

export function useBudgetProgress(monthKey: string, currencyFilter?: string) {
  return useDbQuery(
    `${monthKey}:${currencyFilter ?? 'all'}`,
    db => getBudgetProgress(db, monthKey, currencyFilter),
    []
  );
}
