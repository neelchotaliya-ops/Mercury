# The data layer at scale

Mercury used to keep its entire ledger as one JSON blob in AsyncStorage,
loaded whole into React state on launch. That works fine for a few thousand
transactions and falls over well before a million: every read scanned the
full array, every write re-serialized and rewrote the whole blob, and
AsyncStorage itself has a size cap (6MB by default on Android). This
document is what replaced it and why, and the numbers that back up the "10M
transactions" claim in the title of the migration that did it.

## The shape of the fix

Three ideas, applied together:

1. **SQLite instead of a blob.** `db/schema.ts` defines the tables;
   `db/client.ts` is the only file that imports `expo-sqlite`, wrapping it in
   a narrow `Db` interface (`db/types.ts`) that `node:sqlite` also
   satisfies — the same SQL runs in a `tsx` test script and on-device, no
   mocking.
2. **Keyset pagination, never OFFSET.** Activity's feed pages on
   `(date_ms, seq)`, not a row offset. `OFFSET 500000` makes SQLite walk and
   discard 500,000 rows before it can return anything; a keyset cursor goes
   straight to the right place via the index. Measured below: **no
   difference between page 1 and a page half a million rows in**.
3. **Pre-aggregated rollups.** Every write updates a `rollup` table (by
   month and by day, per account and category) incrementally — see
   `db/apply.ts`'s doc comment for the exact upsert. Home, Budgets, and every
   Insights chart read from `rollup`/`account_balance`/`ledger_stat`, never
   from `transactions` directly, so their cost is **the number of buckets in
   the query's date range, not the number of transactions that ever
   happened.** A million-row, 8-year ledger collapses to ~2,600 rollup rows.

The one invariant every write follows, stated once in `db/apply.ts` and
`db/transactions.ts` and worth repeating here because it's the whole reason
the aggregates stay correct: **never compute a diff — reverse the old
contribution in full, apply the new one in full.** An edit that moves a
transaction across month, category, and account simultaneously is still
just "reverse, then apply" — no case analysis. This is what
`scripts/test-db-rollup.ts`'s property test checks 400 times in a row:
after every random mutation, the incrementally-maintained rollup state must
be byte-identical to a full `rebuildRollups()` from scratch.

## Running the benchmark

```
npm run bench:scale                 # 1,000,000 rows, the default
BENCH_ROWS=10000000 npm run bench:scale   # the actual target — takes minutes
```

Not part of `npm run test`: this measures performance, not correctness, and
it's slow at real scale. It runs against `node:sqlite` on whatever machine
invokes it, so treat the absolute milliseconds as relative — before/after a
change — rather than a promise about a specific phone.

## Testing at scale from inside the app

Settings → **Fill test data** (`app/fill-test-data.tsx`) is the same idea
exposed to a real device: pick a row count (chips for 100K through 100M, or
type an exact number) and fire off `db/seed-scale.ts#seedScaleData`, which
generates and inserts in the same bounded-memory batches as the benchmark
script and Phase 8's streaming import — never materializing the ledger in
JS regardless of size. A progress card shows rows inserted, percent,
rows/sec, and an ETA, updated every ~200ms, with a Cancel button that stops
after the current batch and keeps whatever's already in (rollups are always
rebuilt once at the end, cancelled or not, so the app stays correct either
way).

Unlike `utils/demo-data.ts`'s "Populate sample data" (a small, realistic
2-year ledger with recurring rent/salary/groceries, meant to make a fresh
install look lived-in), this generator is deliberately the opposite: every
field — date, amount, account, category, type — is drawn independently and
uniformly at random within whatever range is configured, with zero
recurring structure. That's the point of it: a chart that only ever sees
clean monthly patterns doesn't tell you much about how it handles real,
noisy data. `scripts/test-seed-scale.ts` checks the distribution actually
is uniform (no day-of-month clustering, amounts within range, type mix
matches the configured weights) as well as the usual balance/`ledger_stat`
correctness.

## Results

Two runs, 8 years of data, 3 accounts, 5 categories, seeded
deterministically (`scripts/support/ledger.ts`) — one at the default size,
one at 3x it, specifically to check that the "flat regardless of scale"
queries actually stay flat rather than creeping up:

| | 1,000,000 rows | 3,000,000 rows |
| --- | --- | --- |
| Bulk insert | 39.5s (25.3k rows/sec) | 136.9s (21.9k rows/sec) |
| `rebuildRollups` (full aggregate pass) | 7.0s | 22.6s |
| Full read scan (export path) | 16.3s (61.5k rows/sec) | 141.6s (21.2k rows/sec) |
| Rollup table size after aggregation | 2,610 rows | — |

Everything above is **O(rows)**, exactly as expected — inserting or reading
every row has to touch every row. The numbers below are the point of the
whole exercise, and they don't move:

| | 1,000,000 rows | 3,000,000 rows |
| --- | --- | --- |
| Activity: first page (cursor = null) | 0.8ms | 0.9ms |
| Activity: deep page (cursor at row N/2) | 0.5ms | 0.9ms |
| `getNetWorth` | 0.1ms | 0.2ms |
| `listAccountBalances` (all accounts) | 0.1ms | 0.1ms |
| `getBudgetProgress` | 1.0ms | 1.0ms |
| `getMonthSummary` | 0.3ms | 0.3ms |
| `computeTotals` (range = all, 8 years) | 3.1ms | 3.2ms |
| `computeCategoryBreakdown` (range = all) | 3.1ms | 3.0ms |
| `computeMonthlySeries` (range = all) | 3.3ms | 3.2ms |

Tripling the ledger moved every one of those by well under a millisecond —
noise, not a trend. That's the keyset-pagination and rollup-table bet paying
off: **the screens a user looks at most (Home, Activity, Budgets, Insights)
cost the same at any ledger size**, and the only operations that scale with
row count are the ones that fundamentally have to touch every row — a bulk
import, or a full export.

Extrapolating the linear operations to the actual 10M target (the flat ones
need no extrapolation — they're flat): bulk insert ≈ 7-8 minutes,
`rebuildRollups` ≈ 75s, a full export scan ≈ 8-12 minutes. All three are
one-time or user-initiated operations (first import, backup/restore), never
something that blocks a screen render — which is exactly why Phase 8 made
export/import stream instead of blocking on an in-memory
`JSON.stringify`/`JSON.parse` of the whole ledger (see
`utils/json-stream.ts` and `utils/import-stream.ts`).

## Where the row-count-proportional costs are hidden

Every cost that does scale with the ledger has been pushed to a place where
it's expected and bounded, not a place where it surprises a user:

- **Bulk insert** (`db/transactions.ts#bulkInsertTransactionRows`) — batched
  multi-row `INSERT OR IGNORE` statements (70 rows/statement, staying under
  SQLite's old 999-parameter default), used by streaming import and demo
  seeding. Skips incremental rollup math entirely in favor of one
  `rebuildRollups()` call after the batch — cheaper than millions of
  incremental upserts.
- **Export** (`utils/data-transfer-io.ts#exportData`) — streams from SQLite
  to the file via `getEachAsync`, one row at a time, never holding the
  transactions array in memory.
- **Import** (`utils/json-stream.ts`, `utils/import-stream.ts`) — a
  bounded-memory JSON reader parses the small entities (accounts,
  categories, budgets, presets — always small regardless of ledger size)
  normally, but reads `data.transactions` one element at a time, batches
  them, and discards each batch after insertion. Never builds the full
  array. Two passes over the file (preview, then apply) rather than one
  pass that has to remember everything.

## What's still O(ledger) on purpose

`rebuildRollups` is a full-table aggregate pass, used after any bulk
operation where computing a diff would be nonsensical (a fresh import, a
"replace all data") — see `db/rebuild.ts`'s comment for why a full rebuild
is *safer* than a hand-rolled bulk-incremental path here, not just simpler.
`monthKeysTouchingAccount` (used when deleting an account, to know which
rollup buckets need touching) is a single indexed scan, not a table scan —
bounded by how many distinct months that one account has activity in, not
by the ledger size.
