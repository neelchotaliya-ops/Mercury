import { Transaction } from '@/types/finance';

/**
 * Deterministic pseudo-random ledger generator, shared by the database tests
 * and the (future) scale benchmark. Extracted from `scripts/test-selectors.ts`
 * with a `years` parameter added — the original only ever produced dates
 * within a single calendar year, which never exercised a multi-year rollup
 * bucket, exactly the case this migration needs stressed.
 */
export interface LedgerOptions {
  years?: number;
  accountIds?: string[];
  categoryIds?: string[];
  /** Fixed starting seed so failures are reproducible. */
  seed?: number;
}

export function buildLedger(count: number, opts: LedgerOptions = {}): Transaction[] {
  const years = opts.years ?? 1;
  const accountIds = opts.accountIds ?? ['a1', 'a2'];
  const categoryIds = opts.categoryIds ?? ['c1', 'c2'];
  let seed = opts.seed ?? 42;

  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const baseYear = new Date().getFullYear() - years + 1;
  const out: Transaction[] = [];

  for (let i = 0; i < count; i++) {
    const r = rand();
    const type: Transaction['type'] = r < 0.55 ? 'expense' : r < 0.85 ? 'income' : 'transfer';
    const year = baseYear + Math.floor(rand() * years);
    const month = Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 28);
    const hour = Math.floor(rand() * 24);
    const minute = Math.floor(rand() * 60);
    const date = new Date(year, month, day, hour, minute).toISOString();
    const fromAccount = accountIds[Math.floor(rand() * accountIds.length)];
    const toAccount = accountIds[Math.floor(rand() * accountIds.length)];

    out.push({
      id: `t${i}`,
      type,
      amount: Math.round(rand() * 500000) / 100,
      accountId: fromAccount,
      toAccountId: type === 'transfer' ? (toAccount === fromAccount ? accountIds[0] : toAccount) : undefined,
      categoryId: type === 'transfer' ? undefined : categoryIds[Math.floor(rand() * categoryIds.length)],
      date,
      note: rand() < 0.3 ? `note-${Math.floor(rand() * 50)}` : undefined,
      createdAt: date,
    });
  }

  return out;
}
