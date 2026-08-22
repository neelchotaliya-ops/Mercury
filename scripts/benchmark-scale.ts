/**
 * Scale benchmark for the SQLite data layer — the concrete answer to "does
 * this actually work at 10M transactions," not just "does it work at all."
 *
 * Runs against `node:sqlite` (see `scripts/support/node-db.ts`), the same
 * `Db` interface the device uses, so every number here comes from the exact
 * SQL the app runs — just on a desktop CPU instead of a phone's, so treat
 * these as relative (before/after a change) rather than absolute device
 * numbers.
 *
 * Default row count is 1,000,000 — enough to be meaningful, fast enough to
 * run routinely. Override for the real target:
 *
 *   BENCH_ROWS=10000000 npm run bench:scale
 *
 * Not part of `npm run test`: this measures performance, not correctness,
 * and a 10M-row run takes minutes — it shouldn't gate every test run. Each
 * check has a budget printed next to it; a budget being exceeded prints a
 * warning and the run still exits 0 (this is a visibility tool, not a CI
 * gate — there's no reference device to calibrate a hard pass/fail against
 * from a desktop CPU).
 */

import { applyMigrations } from '../db/schema';
import { bulkInsertTransactionRows, iterateTransactions, pageTransactions } from '../db/transactions';
import { rebuildRollups } from '../db/rebuild';
import { insertAccount, insertCategory, getNetWorth, listAccountBalances, getBudgetProgress, getMonthSummary } from '../db/entities';
import { computeTotals, computeCategoryBreakdown, computeMonthlySeries, DEFAULT_INSIGHT_FILTER } from '../db/insights';
import { buildLedger } from './support/ledger';
import { openTestDb } from './support/node-db';
import { Account, Category } from '../types/finance';

const ROWS = Number(process.env.BENCH_ROWS ?? 1_000_000);
const YEARS = 8;

interface TimingResult {
  label: string;
  ms: number;
  budgetMs: number;
}

const results: TimingResult[] = [];

async function timed<T>(label: string, budgetMs: number, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const out = await fn();
  const ms = performance.now() - start;
  results.push({ label, ms, budgetMs });
  const flag = ms > budgetMs ? '  ⚠ over budget' : '';
  console.log(`${ms.toFixed(1).padStart(10)}ms  ${label}${flag}`);
  return out;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

async function main() {
  console.log(`Scale benchmark: ${ROWS.toLocaleString()} transactions over ${YEARS} years\n`);

  const db = openTestDb();
  await applyMigrations(db);

  const accounts: Account[] = ['a1', 'a2', 'a3'].map((id, i) => ({
    id,
    name: `Account ${id}`,
    type: 'bank',
    icon: 'business-outline',
    color: '#3B82F6',
    initialBalance: 1000 * (i + 1),
    createdAt: '2018-01-01T00:00:00.000Z',
  }));
  const categories: Category[] = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id, i) => ({
    id,
    name: `Category ${id}`,
    icon: 'cart',
    color: '#5CB98F',
    kind: i === 0 ? 'income' : 'expense',
  }));
  for (let i = 0; i < accounts.length; i++) await insertAccount(db, accounts[i], i);
  for (let i = 0; i < categories.length; i++) await insertCategory(db, categories[i], i);

  console.log('Generating ledger…');
  const genStart = performance.now();
  const ledger = buildLedger(ROWS, {
    years: YEARS,
    accountIds: accounts.map(a => a.id),
    categoryIds: categories.slice(1).map(c => c.id),
  });
  console.log(`  ${(performance.now() - genStart).toFixed(0)}ms\n`);

  const memBefore = process.memoryUsage().heapUsed;

  await timed(`bulk insert ${ROWS.toLocaleString()} rows`, ROWS / 20, () =>
    bulkInsertTransactionRows(db, ledger)
  );

  const insertRowsPerSec = Math.round(ROWS / (results[results.length - 1].ms / 1000));
  console.log(`  → ${insertRowsPerSec.toLocaleString()} rows/sec\n`);

  await timed('rebuildRollups (full aggregate pass)', ROWS / 15, () => rebuildRollups(db));

  const memAfterInsert = process.memoryUsage().heapUsed;
  console.log(`  heap: ${mb(memBefore)} → ${mb(memAfterInsert)} (+${mb(memAfterInsert - memBefore)})\n`);

  await timed('first page (cursor = null, limit 60)', 50, () => pageTransactions(db, {}, null, 60));

  // A cursor from partway through the ledger — the OFFSET read to find it is
  // O(N) and deliberately NOT part of the timed budget; only the keyset page
  // fetch *from* that cursor is what this is testing.
  const midRow = await db.getFirstAsync<{ date_ms: number; seq: number }>(
    `SELECT date_ms, seq FROM transactions ORDER BY date_ms DESC, seq DESC LIMIT 1 OFFSET ${Math.floor(ROWS / 2)}`
  );
  await timed('deep page (cursor at row N/2, limit 60)', 50, () =>
    pageTransactions(db, {}, midRow ? { dateMs: midRow.date_ms, seq: midRow.seq } : null, 60)
  );

  await timed('getNetWorth', 20, () => getNetWorth(db));
  await timed('listAccountBalances', 20, () => listAccountBalances(db));
  await timed('getBudgetProgress (empty budget list)', 30, () => getBudgetProgress(db, '2024-06'));
  await timed('getMonthSummary (one month)', 20, () => getMonthSummary(db, '2024-06', null));

  await timed('computeTotals (range=all)', 200, () =>
    computeTotals(db, { ...DEFAULT_INSIGHT_FILTER, range: 'all' }, new Date(), false)
  );
  await timed('computeCategoryBreakdown (range=all)', 200, () =>
    computeCategoryBreakdown(db, { ...DEFAULT_INSIGHT_FILTER, range: 'all' }, categories)
  );
  await timed('computeMonthlySeries (range=all)', 200, () =>
    computeMonthlySeries(db, { ...DEFAULT_INSIGHT_FILTER, range: 'all' })
  );

  let scanned = 0;
  await timed(`full read scan (iterateTransactions, ${ROWS.toLocaleString()} rows)`, ROWS / 20, async () => {
    for await (const _tx of iterateTransactions(db)) scanned++;
  });
  console.log(`  → ${Math.round(ROWS / (results[results.length - 1].ms / 1000)).toLocaleString()} rows/sec, scanned=${scanned}\n`);

  const over = results.filter(r => r.ms > r.budgetMs);
  console.log('─'.repeat(60));
  if (over.length > 0) {
    console.log(`${over.length} check(s) over budget:`);
    for (const r of over) console.log(`  ${r.label}: ${r.ms.toFixed(1)}ms (budget ${r.budgetMs}ms)`);
  } else {
    console.log('All checks within budget.');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
