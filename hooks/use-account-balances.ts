import { listAccountBalances, getNetWorth } from '@/db/entities';
import { useDbQuery } from './use-db-query';

/** Every account's balance in one query, O(accounts) not O(accounts x transactions). */
export function useAccountBalances() {
  return useDbQuery('balances', db => listAccountBalances(db), new Map<string, number>());
}

export function useNetWorth() {
  return useDbQuery('net-worth', db => getNetWorth(db), 0);
}
