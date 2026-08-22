import { getBudgetProgress } from '@/db/entities';
import { useDbQuery } from './use-db-query';

export function useBudgetProgress(monthKey: string) {
  return useDbQuery(monthKey, db => getBudgetProgress(db, monthKey), []);
}
