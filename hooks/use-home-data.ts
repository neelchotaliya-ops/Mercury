import { getMonthSummary } from '@/db/entities';
import { getRecentTransactions } from '@/db/transactions';
import { useDbQuery } from './use-db-query';

export function useMonthSummary(monthKey: string, accountId: string | null) {
  return useDbQuery(`${monthKey}|${accountId ?? ''}`, db => getMonthSummary(db, monthKey, accountId), {
    income: 0,
    expense: 0,
  });
}

export function useRecentTransactions(accountId: string | null, limit = 5) {
  return useDbQuery(`${accountId ?? ''}|${limit}`, db => getRecentTransactions(db, accountId, limit), []);
}
