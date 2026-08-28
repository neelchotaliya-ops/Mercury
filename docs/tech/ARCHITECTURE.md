# Mercury — Architecture (Technical Bible, Layer 1)

> Audience: AI coding agents and core maintainers. This document assumes you can read TypeScript and SQL. For a code-free explanation of the same system, see `docs/guides/SYSTEM_OVERVIEW.md`.

Mercury is a **local-first, offline-only** personal finance app built with **React Native + Expo (SDK 54)**, using **expo-sqlite** as its sole data store. There is no backend, no network API, no user accounts, no sync service — every screen, every query, and every write operates against one on-device SQLite file (`mercury.db`). This is the single most important architectural fact about the codebase: when this document says "the data layer," it means SQLite on the device the app is running on, nothing else.

---

## 1. Tech stack

### Framework
| Package | Version | Role |
|---|---|---|
| `expo` | ~54.0.35 | Managed workflow, native module orchestration |
| `react` / `react-dom` | 19.1.0 | UI library |
| `react-native` | 0.81.5 | Native runtime |
| `expo-router` | ~6.0.24 | File-based routing (see `APP_FLOW.md`) |
| `expo-dev-client` | ~6.0.21 | Custom dev client support |
| `expo-constants`, `expo-status-bar`, `expo-system-ui`, `expo-splash-screen` | — | App shell plumbing |
| `expo-font` + `@expo-google-fonts/manrope` + `@expo-google-fonts/sora` | — | Typeface loading (Sora for display/titles, Manrope for body) |

### Navigation
`@react-navigation/native ^7.1.8`, `@react-navigation/bottom-tabs ^7.4.0`, `@react-navigation/elements ^2.6.3` — the libraries `expo-router` is built on. The app does **not** use the default bottom-tab UI; it supplies a fully custom `tabBar` render prop (`components/navigation/floating-tab-bar.tsx`).

### Data layer
| Package | Role |
|---|---|
| `expo-sqlite ~16.0.10` | The database. The **only** persistent store in the app. |
| `@react-native-async-storage/async-storage ^2.2.0` | Legacy — held the entire app's data as one JSON blob before the SQLite migration. Today it is used only for (a) the one-time blob-migration source on an old install, and (b) two small non-financial caches (recent split-participant names, widget-summary fallback). It is **not** a general-purpose store any more. |
| `expo-file-system ^19.0.23` | Reading/writing export and bank-statement files |
| `expo-document-picker ^14.0.8` | Picking an import file |
| `expo-sharing ^14.0.8` | Handing an export file to the OS share sheet |

### UI / animation
`react-native-reanimated ~4.1.1` + `react-native-worklets 0.5.1` (UI-thread animation — see `UI_BLUEPRINT.md` for the app's motion doctrine), `react-native-gesture-handler ~2.28.0`, `react-native-screens ~4.16.0`, `react-native-safe-area-context ~5.6.0`, `react-native-svg 15.12.1` (every chart is hand-built on raw SVG, no charting library), `expo-blur ~15.0.7`, `expo-linear-gradient ~15.0.8`, `expo-image ~3.0.11`, `@expo/vector-icons ^15.0.3`, `react-native-web ~0.21.0` (the app also runs in a browser for development/testing).

### Native features
`react-native-android-widget ^0.22.0` (Android home-screen widgets), `expo-haptics ~15.0.8`, `expo-notifications ^0.32.17` (local notifications only — no push infrastructure), `expo-image-picker ~17.0.11` + `expo-text-extractor ^2.0.0` (on-device OCR for receipt scanning — nothing leaves the device), `expo-share-intent ^5.1.1` (registers Mercury as an OS share target for images).

### Dev / test tooling
`typescript ~5.9.2`, `tsx ^4.23.12` (runs pure-logic modules as plain Node scripts — see §3.4), `eslint ^9.25.0` + `eslint-config-expo`, `playwright-core ^1.62.1`. `npm test` chains ~20 `tsx scripts/test-*.ts` scripts; there is no Jest/RNTL component-testing setup — testing strategy is "keep business logic pure and test it directly," not "mount components and assert on output."

**There is no backend, no REST/GraphQL client, no auth library, no crash-reporting SDK, and no analytics SDK anywhere in `package.json`.** If you are asked to "call the API" or "check the network layer," the correct answer is that none exists — every operation in this app is a local SQLite query or a local file operation.

---

## 2. State management

Mercury deliberately runs **two different state-management strategies side by side**, split by data size:

### 2.1 Small, bounded entities → React state (`FinanceContext`)
`context/finance-context.tsx` holds `accounts`, `categories`, `subcategories`, `budgets`, `quickPresets`, and `settings` in a `useState`-held `FinanceEntities` object. These lists are always small (tens of rows, even at extreme ledger sizes) and are reloaded from SQLite in full every time they change.

### 2.2 Unbounded data (transactions, and derived aggregates) → direct SQLite queries via hooks
`transactions` is **deliberately absent** from `FinanceEntities`. It used to live there as a plain array; every mutation copied the whole array (a filter + a spread-insert), and because the array's identity changed on every write, the context's value identity changed too — re-rendering every screen consuming `useFinance()` on every single edit, regardless of whether that screen showed the changed data. Screens that need transaction-level data call a dedicated query hook (`hooks/use-*`) instead, which reads SQLite on demand.

### 2.3 The invalidation signal — `db/version.ts`
Both halves are kept in sync by one thing: a single module-level counter.

```
let version = 0;
const listeners = new Set<() => void>();
bumpDataVersion()        // version++, fire all listeners
getDataVersion()         // read version
subscribeDataVersion(fn) // React's useSyncExternalStore subscribe
```

Every write path in the app — every `insertX`/`updateX`/`deleteX` in `db/entities.ts`, `db/transactions.ts`, `db/recurring.ts`, `db/splits.ts`, the bulk import/seed paths — calls `bumpDataVersion()` once it has committed. `FinanceContext` and every `useDbQuery`-based hook subscribe to this counter via `useSyncExternalStore(subscribeDataVersion, getDataVersion, getDataVersion)`, so **any write anywhere in the app triggers every mounted screen to re-fetch its own data.**

This is deliberately coarse — one counter for the whole database, not one per table. The code comment in `db/version.ts` explains why: a write to one table can affect a derived read on another (deleting an account changes every balance and budget figure that touched it), and getting that fan-out exactly right per call site is easy to get subtly wrong. The cost of the coarseness is small because every individual re-fetch is a cheap indexed query against `rollup`/entity tables, never a re-scan of the ledger — see §4.

A **second**, structurally identical external store exists purely for background-operation progress: `db/operation-status.ts` (`startOperation`/`updateOperation`/`finishOperation`/`cancelOperation`/`subscribeOperations`/`getActiveOperation`/`subscribeOperationCompletions`). It tracks at most one of `import | export | fill-test-data | reset` running at a time, consumed by the root-mounted `BackgroundOperationBanner`.

### 2.4 `useFinance()` — the context consumer hook
```ts
const { state, addTransaction, updateTransaction, deleteTransaction,
        addAccount, ..., resetAllData, completeOnboarding, persistError, migrationFailed } = useFinance();
```
`state: FinanceEntities` (`{accounts, categories, subcategories, budgets, quickPresets, settings, isLoaded}`). Every mutator wraps a call through `withDb` — a `useCallback` that resolves `getDb()`, runs the passed function, clears `persistError` on success, and sets it (without swallowing the error — it's rethrown to the caller too) on failure. **`persistError` is the entire app's write-failure signal** — see `AI_CONTEXT.md` §"data-loss protection."

---

## 3. Design patterns (recurring, load-bearing — do not violate these without understanding why they exist)

### 3.1 Pre-aggregation, not scanning (`rollup`, `account_balance`, `ledger_stat`)
The single biggest architectural decision in this codebase: **no screen ever computes an aggregate by scanning the transactions table.** Three tables exist purely to make reads O(1)/O(buckets) instead of O(ledger size):
- **`rollup`** — one row per `(grain, bucket, account_id, category_id)` cell (grain = `'M'`onth or `'D'`ay), storing `income`/`expense`/`transfer_in`/`transfer_out` totals and counts in integer minor units. A million-row ledger collapses to a few hundred cells. This is what Insights, Home, and Budgets read.
- **`account_balance`** — one row per account, holding a running `delta` (excludes `initial_balance`, so editing the opening balance never touches this table). O(1) per-account balance.
- **`ledger_stat`** — four fixed rows (`all`/`income`/`expense`/`transfer`) holding running counts and nets. O(1) instead of `COUNT(*)`.

### 3.2 Never diff — always reverse, then apply
`db/rollup-math.ts` (pure) + `db/apply.ts` (the only module allowed to write to the three tables above) implement the maintenance rule for these aggregates: an edit is never computed as a delta between old and new. Instead, the old row's full contribution is **reversed** (`negateContributions`/`negateBalances`/`negateStats`), then the new row's full contribution is **applied**. This is simpler to prove correct than diffing and is the pattern every write path (`insertTransaction`, `updateTransaction`, `recordRepayment`, `processDueRules`) follows via the two composite entry points `applyRow(db, row)` / `reverseRow(db, row)`.

**Known violation, worth knowing about**: `db/bank-import.ts#applyBankImport` does **not** go through `applyRow` — it hand-writes SQL against `rollup` directly, and that SQL references columns that don't exist in the schema (`expenses`, `count` instead of the real `expense`, `*_count` columns). The insert is wrapped in a per-row `try/catch`, so it fails silently — bank-imported transactions land correctly in `transactions` but never correctly update `rollup`/`account_balance`/`ledger_stat`. See `FEATURES.md` §"Bank Statement Import" and `AI_CONTEXT.md` §"known issues" before touching this file.

### 3.3 Keyset pagination, never `OFFSET`
`db/transactions.ts#pageTransactions` pages by `(date_ms, seq)` — the last row's cursor, not a page number. `OFFSET` degrades linearly with depth on a large table; this stays flat. `seq` (an `AUTOINCREMENT` integer, separate from the app-level `id` string) exists specifically to give a stable, cheap-to-index tiebreak, since `date_ms` alone isn't unique.

### 3.4 The pure/IO split — "tsx-testability"
Repeated across the codebase, always for the same reason: a module that avoids importing `react-native`/`expo-*` can be run and tested directly under Node via `tsx`, with `node:sqlite` standing in for `expo-sqlite` where a database is needed — no emulator, no device.

- **Pure (safe to import in a test script)**: `db/rollup-math.ts`, `db/types.ts`, most of `db/*.ts` (they take a narrow `Db` interface, not a concrete `expo-sqlite` handle), `utils/data-transfer.ts`, `utils/json-stream.ts`, `utils/csv-stream.ts`, `utils/import-stream.ts`, `utils/recurring-engine.ts`, `utils/bank-statement.ts`, `utils/receipt-parser.ts`, `utils/receipt-match.ts`, `utils/selectors.ts`, `utils/insights.ts`, `utils/widget-data.ts`, `utils/id.ts`, `utils/date.ts`, `utils/currency.ts`.
- **IO shells (native imports, not tsx-testable)**: `db/client.ts` (the *only* file allowed to import `expo-sqlite`), `utils/data-transfer-io.ts`, `utils/haptics.ts`, `utils/notifications.ts`, `utils/widget-data-io.ts`, `utils/widget-bridge.ts`, `utils/receipt-scan.ts`.

When adding a new feature, put the logic (validation, math, formatting, parsing) in a pure module and keep the native-import surface as thin as possible around it. This is not a style preference — it's the reason `npm test` can run ~20 test scripts with zero device/emulator dependency.

### 3.5 The `Db` interface — engine-agnostic SQL
`db/types.ts` defines a narrow structural interface (`execAsync`, `runAsync`, `getFirstAsync`, `getAllAsync`, `getEachAsync`, `withTransaction`) that `expo-sqlite`'s real handle satisfies with no adapter, and that `node:sqlite` can also satisfy in tests. Every function under `db/` takes a `Db`, never `expo-sqlite` directly — this is what makes the exact same SQL run identically on-device and in a test script.

### 3.6 Bulk-load performance: drop indexes, batch inserts, checkpoint
For any operation writing thousands+ rows (import, restore, the test-data seeder), the app: (1) drops the transactions table's 7 secondary indexes (`db/schema.ts#dropBulkIndexes`) — maintaining 7 indexes per inserted row is the dominant cost of a bulk load; (2) batches inserts as multi-row `INSERT OR IGNORE` statements (`bulkInsertTransactionRows`, batch size 800, chosen because each `runAsync` crosses the JS↔native bridge, which dominates wall time on-device); (3) issues `PRAGMA wal_checkpoint(PASSIVE)` periodically to bound WAL growth; (4) rebuilds the indexes (`ensureBulkIndexes`) and the three aggregate tables (`rebuildRollups`) once, at the end, rather than maintaining them incrementally per row. `ensureBulkIndexes` also runs unconditionally on every app launch (`db/client.ts#open`) to repair a database left mid-drop by a crash.

### 3.7 Coarse, not per-table, cache invalidation
Covered in §2.3 — repeated here because it's easy to "fix" by mistake. Don't introduce a per-table version counter without first confirming a specific screen's re-fetch rate is an actual, measured problem — the existing single-counter design is a deliberate trade-off, not an oversight.

---

## 4. Data schema

SQLite, tracked via `PRAGMA user_version`. Migrations live in `db/schema.ts` as an append-only array (`MIGRATIONS: string[]`); `applyMigrations(db)` runs every migration between the current version and `MIGRATIONS.length` inside one transaction each, bumping `user_version` after each. This function is safe to call from a fully cold state — including from the Android widget's headless task, which can run before the main app has ever launched.

**Current `LATEST_SCHEMA_VERSION = 5`.**

### v1 — initial schema
```sql
meta(key PK, value)                                    -- internal bookkeeping, WITHOUT ROWID
settings(key PK, value)                                -- WITHOUT ROWID
accounts(id PK, name, type, icon, color,
         initial_balance REAL DEFAULT 0, created_at,
         archived INT DEFAULT 0, sort_order INT DEFAULT 0)
categories(id PK, name, icon, color,
           kind CHECK IN('income','expense'),
           is_default INT DEFAULT 0, sort_order INT DEFAULT 0)
transactions(seq PK AUTOINCREMENT, id UNIQUE,
             type CHECK IN('income','expense','transfer'), amount REAL,
             account_id REFERENCES accounts ON DELETE CASCADE,
             to_account_id REFERENCES accounts ON DELETE CASCADE,
             category_id REFERENCES categories ON DELETE SET NULL,
             date TEXT, date_ms INTEGER, month_key, day_key,
             note, note_lc, created_at)
budgets(id PK, category_id REFERENCES categories ON DELETE CASCADE,
        monthly_limit REAL, created_at, sort_order)
quick_presets(id PK, label, emoji, amount,
              type CHECK IN('income','expense'),
              category_id, account_id, sort_order)

-- rollup: the core pre-aggregation table (see §3.1)
rollup(grain CHECK IN('M','D'), bucket, account_id, category_id,
       income INT, expense INT, transfer_in INT, transfer_out INT,
       income_count INT, expense_count INT, transfer_count INT,
       PRIMARY KEY(grain,bucket,account_id,category_id))  -- WITHOUT ROWID
account_balance(account_id PK REFERENCES accounts ON DELETE CASCADE,
                delta INT DEFAULT 0)                       -- WITHOUT ROWID
ledger_stat(key PK, n INT, net INT)                        -- WITHOUT ROWID, 4 seeded rows

-- indexes
idx_tx_date(date_ms,seq), idx_tx_type_date(type,date_ms,seq),
idx_tx_acct_date(account_id,date_ms,seq),
idx_tx_to_date(to_account_id,date_ms,seq) WHERE to_account_id IS NOT NULL,
idx_tx_cat_date(category_id,date_ms,seq) WHERE category_id IS NOT NULL,
idx_tx_month(month_key), idx_tx_day(day_key),   -- repair/rebuild only, not the read path
idx_rollup_cat(grain,category_id,bucket), idx_rollup_acct(grain,account_id,bucket)
```
Why `seq` exists alongside `id`: it reproduces exact insert order for pagination tiebreaks, keeps secondary indexes small (8-byte int vs. ~17-byte string id), and `utils/id.ts#generateId()`'s ids are **not** lexicographically sortable by time — ordering by `id` would be wrong.

Why `month_key`/`day_key` are stored, not computed at query time: dates persist as UTC ISO strings, and SQLite's `localtime` modifier is non-deterministic across devices — it could disagree with JS at DST boundaries. `utils/date.ts#monthKeyOf`/`dayKeyOf` compute them once, at write time.

### v2 — multi-currency + account-scoped budgets
```sql
ALTER TABLE accounts ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE budgets  ADD COLUMN account_id TEXT REFERENCES accounts(id);
ALTER TABLE budgets  ADD COLUMN currency   TEXT NOT NULL DEFAULT 'INR';
```

### v3 — subcategories + payee
```sql
CREATE TABLE subcategories (
  id PK, category_id NOT NULL REFERENCES categories ON DELETE CASCADE,
  name, icon, color, is_default INT DEFAULT 0, sort_order INT DEFAULT 0
);
ALTER TABLE transactions ADD COLUMN payee TEXT;
ALTER TABLE transactions ADD COLUMN subcategory_id TEXT REFERENCES subcategories ON DELETE SET NULL;
CREATE INDEX idx_tx_payee   ON transactions(payee) WHERE payee IS NOT NULL;
CREATE INDEX idx_tx_subcat  ON transactions(subcategory_id) WHERE subcategory_id IS NOT NULL;
CREATE INDEX idx_subcat_cat ON subcategories(category_id);
```
Subcategory and payee filtering are **not** rolled into `rollup` — the rollup stays keyed on `category_id` only. Filtering by subcategory/payee is a bounded raw scan, the same fallback pattern used for `minAmount` filtering in Insights.

### v4 — recurring rules
```sql
CREATE TABLE recurring_rules (
  id PK, type CHECK IN('income','expense'), amount REAL NOT NULL,
  account_id NOT NULL REFERENCES accounts ON DELETE CASCADE,
  category_id REFERENCES categories ON DELETE SET NULL,
  subcategory_id REFERENCES subcategories ON DELETE SET NULL,
  payee, note,
  frequency CHECK IN('daily','weekly','monthly','yearly','custom'),
  interval_unit CHECK IN('day','week','month','year'),  -- 'custom' only
  interval_value INTEGER,                                 -- 'custom' only
  day_of_week INTEGER,   -- 0=Sun..6=Sat, 'weekly' only
  day_of_month INTEGER,  -- 1-31, or -1 = last day, 'monthly' only
  start_date NOT NULL, end_date,
  next_due NOT NULL,     -- the processing cursor
  auto_create INT DEFAULT 0, reminder_days INT DEFAULT 1,
  active INT DEFAULT 1, created_at NOT NULL
);
ALTER TABLE transactions ADD COLUMN recurring_rule_id TEXT REFERENCES recurring_rules ON DELETE SET NULL;
CREATE INDEX idx_recurring_next ON recurring_rules(next_due) WHERE active = 1;
CREATE INDEX idx_tx_recurring   ON transactions(recurring_rule_id) WHERE recurring_rule_id IS NOT NULL;
```

### v5 — split expenses
```sql
CREATE TABLE split_participants (
  id PK, transaction_id NOT NULL REFERENCES transactions ON DELETE CASCADE,
  name NOT NULL, share_amount REAL NOT NULL, paid_amount REAL DEFAULT 0,
  status CHECK IN('pending','partial','paid') DEFAULT 'pending',
  note, settled_at, created_at NOT NULL
);
ALTER TABLE transactions ADD COLUMN split_expense_id TEXT REFERENCES transactions ON DELETE SET NULL;
CREATE INDEX idx_split_tx     ON split_participants(transaction_id);
CREATE INDEX idx_split_status ON split_participants(transaction_id, status);
CREATE INDEX idx_tx_split_ref ON transactions(split_expense_id) WHERE split_expense_id IS NOT NULL;
```
Data model: the shared bill is a normal `expense` transaction — there is no new transaction type. `split_participants` rows describe *other people's* shares only; the payer's own share is implicit (total minus the sum of participant shares) and is never inserted as a participant row by the canonical flow (`db/splits.ts`). A repayment is a normal `income` transaction whose `split_expense_id` points back at the original expense's `id`.

### Connection-level pragmas (`db/client.ts#open`)
Set once per connection, in one `execAsync` call: `journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL`, `busy_timeout=5000`, `temp_store=MEMORY`. WAL is a no-op on the web target; the rest apply everywhere.

---

## 5. The `Db` interface (API surface every module programs against)

```ts
interface Db {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: unknown[]): Promise<SqlRunResult>; // {lastInsertRowId, changes}
  getFirstAsync<T>(source: string, params?: unknown[]): Promise<T | null>;
  getAllAsync<T>(source: string, params?: unknown[]): Promise<T[]>;
  getEachAsync<T>(source: string, params?: unknown[]): AsyncIterableIterator<T>;
  withTransaction(task: (txn: Db) => Promise<void>): Promise<void>;
}
```
`db/client.ts#adapt()` wraps the real `expo-sqlite` handle to satisfy this. `withTransaction` is reentrant via a closed-over `depth` counter — a nested call runs the task directly against the already-open transaction rather than nesting `expo-sqlite`'s own transaction primitives, which are not reentrant (confirmed by a real "cannot rollback - no transaction is active" thrown when this was tried on web). Native uses `withExclusiveTransactionAsync` (matters because the Android widget's headless task opens a second connection to the same file — this is what serializes writes between the two connections); web uses `withTransactionAsync` (`withExclusiveTransactionAsync` is not supported there).

`getDb(): Promise<Db>` is a singleton — the first caller creates and caches the open promise; concurrent callers on a cold start share it; a failed open is not cached, so the next caller gets a fresh attempt.

---

## 6. Directory index — file-by-file responsibility

### `db/` — the entire data layer
| File | Responsibility |
|---|---|
| `client.ts` | The only file importing `expo-sqlite`. `getDb()` singleton, connection pragmas, `checkpoint()`, blob-migration trigger on open. |
| `types.ts` | The `Db` interface and every SQL row shape (`TransactionRow`, `AccountRow`, `RecurringRuleRow`, `SplitParticipantRow`, `SubcategoryRow`, etc). |
| `schema.ts` | Migrations (v1–v5), `applyMigrations`, `dropBulkIndexes`/`ensureBulkIndexes`, `execWithLockRetry` (5-attempt backoff specifically for `SQLITE_LOCKED`, distinct from `SQLITE_BUSY`). |
| `version.ts` | The single global data-invalidation counter (§2.3). |
| `operation-status.ts` | The background-operation progress store (§2.3, second paragraph). |
| `rollup-math.ts` | Pure arithmetic for rollup/balance/stat contributions — the most safety-critical module in the app (§3.1–3.2). |
| `apply.ts` | The only module allowed to write to `rollup`/`account_balance`/`ledger_stat`. `applyRow`/`reverseRow`. |
| `rebuild.ts` | `rebuildRollups(db)` — full from-scratch recompute via `GROUP BY`, ~2 orders of magnitude faster than replaying every row's delta. |
| `entities.ts` | CRUD + derived reads for accounts/categories/budgets/presets/settings. `listAccountBalances`, `getNetWorth`, `getBudgetProgress`, `getMonthSummary`. |
| `transactions.ts` | Transaction CRUD, `pageTransactions` (keyset pagination), `bulkInsertTransactionRows`, `iterateTransactions` (async generator, O(1) memory export), `getLedgerStat`, `getRecentTransactions`. |
| `insights.ts` | Rollup-backed Insights queries — `computeTotals`, `computeCategoryBreakdown`, `computeMonthlySeries`, `computeDailyHeatmap`, `computeWeekdayPattern`, `compareWithPreviousPeriod`, `computeTopNotes` (bounded raw scan, capped at `UNAGGREGATED_SCAN_CAP=20_000` — free-text notes have unbounded cardinality so can't be rolled up), plus `getRecurringInsights`/`getSplitInsights` (dynamic imports of `recurring.ts`/`splits.ts`). |
| `recurring.ts` | Recurring-rule CRUD, `processDueRules` (the engine's DB-facing half — see `FEATURES.md`). |
| `splits.ts` | Split-participant CRUD, `getSplitSummary`, `listUnsettledSplits`, `recordRepayment`. |
| `subcategories.ts` | Subcategory CRUD, category-scoped listing. |
| `bank-import.ts` | Bank-statement duplicate detection + bulk apply. **Contains a known rollup-writing bug — see `AI_CONTEXT.md`.** |
| `seed-scale.ts` | The Settings → "Fill test data" bulk random-ledger generator, for stress-testing at real volume. |
| `migrate-from-blob.ts` | Pure core of the one-time AsyncStorage-blob → SQLite migration. |
| `apply.ts` | (listed above) |

### `context/` — React state
| File | Responsibility |
|---|---|
| `finance-context.tsx` | `FinanceProvider`/`useFinance()` — small-entity state, all mutators, the `AppState` foreground/background listener (data refresh, recurring-rule processing, WAL checkpoint), first-load bootstrap/fresh-install seeding. |
| `theme-context.tsx` | `AppThemeProvider` — theme token access (the app has one visual theme; see `UI_BLUEPRINT.md`). |

### `hooks/` — reusable React hooks
| File | Responsibility |
|---|---|
| `use-db-query.ts` | The shared query primitive (§7 below). |
| `use-home-data.ts` | `useMonthSummary`, `useRecentTransactions`. |
| `use-account-balances.ts` | `useAccountBalances`, `useNetWorth`. |
| `use-budget-progress.ts` | `useBudgetProgress`. |
| `use-insights-data.ts` | `useInsightsData` — fires 7 parallel `useDbQuery` calls for the Spending Insights view. |
| `use-transaction-page.ts` | `useTransactionPage` — hand-rolled keyset-paginated list backing Activity (not built on `useDbQuery`). |
| `use-ledger-header.ts` | `useLedgerHeader` — O(1) via `ledger_stat` unless a search needle is active, then a bounded scan. |
| `use-screen-ready.ts` | Defers heavy mounts until `InteractionManager` interactions finish. |
| `use-mount-pop.ts` | The app's one entrance-animation signature (see `UI_BLUEPRINT.md`). |
| `use-reduced-motion.ts` | Reads the OS "reduce motion" accessibility setting. |
| `use-keyboard-bottom-inset.ts` | Keyboard height/visibility, used to lift sheets/forms clear of the soft keyboard. |
| `use-shared-receipt.ts` | Routes an incoming OS share-intent image into Add Transaction. |

### `utils/` — business logic and platform shells
See §3.4 for the pure/IO split. Full list and purpose in `docs/tech/AI_CONTEXT.md`'s companion research is folded into `FEATURES.md`; key ones: `data-transfer.ts`/`data-transfer-io.ts`/`json-stream.ts`/`csv-stream.ts`/`import-stream.ts` (backup export/import), `recurring-engine.ts` (pure date math), `bank-statement.ts` (CSV bank-format detection + `calculateSplitShares`), `receipt-parser.ts`/`receipt-match.ts`/`receipt-scan.ts` (OCR pipeline), `selectors.ts` (legacy in-memory derived reads, still used on small already-loaded arrays), `insights.ts` (the pure oracle `db/insights.ts` is tested against), `widget-data.ts`/`widget-data-io.ts`/`widget-bridge.ts` (Android widget data sync — §8), `id.ts`, `date.ts`, `currency.ts`, `haptics.ts`, `notifications.ts`.

### `app/` — routes (expo-router file-based). Full inventory in `APP_FLOW.md` and `docs/guides/SCREEN_MAP_AND_BEHAVIOR.md`.

### `components/` — UI. Full inventory in `UI_BLUEPRINT.md`.

### `widgets/` — Android home-screen widget React trees (`quick-log-widget.tsx`, `quick-actions-widget.tsx`, `widget-task-handler.tsx`, `widget-format.ts`) — rendered outside a normal React tree by `react-native-android-widget`; see §8.

### `types/finance.ts` — every domain type
`Account`, `AccountType`, `Category`, `CategoryKind`, `Subcategory`, `Transaction`, `TransactionType`, `Budget`, `RecurringRule`, `RecurringFrequency`, `IntervalUnit`, `SplitParticipant`, `SplitStatus`, `AppSettings`, `NumberFormat`, `QuickPreset`, `FinanceState` (the legacy full-in-memory shape, still the parameter type for `utils/selectors.ts`/`utils/insights.ts`'s pure functions and for the JSON backup shape). Note: `RecurringRule` and `SplitParticipant` are **not** part of `FinanceState`/`FinanceContext` — they're always queried fresh from SQLite per-screen, unlike accounts/categories/subcategories.

### `constants/` — design tokens and static data
`theme.ts` (colors/gradients/typography/spacing/radius/shadows), `motion.ts` (animation durations/easings/springs), `categories.ts` (default categories, account-type metadata), `icons.ts` (icon name registry), `shapes.ts` (hand-authored blob SVG paths).

### `storage/storage.ts`
Legacy AsyncStorage key + `PersistedFinanceState` type (the JSON blob/export shape) — kept for the migration path and export/import type compatibility, not for live reads/writes.

---

## 7. The query-hook contract (`hooks/use-db-query.ts`)

```ts
function useDbQuery<T>(key: string, run: (db: Db) => Promise<T>, initial: T): { data: T; loading: boolean; error: unknown };
```
Subscribes to `subscribeDataVersion` via `useSyncExternalStore`. Re-runs `run(db)` in a `useEffect` whenever `key` (a caller-built string, typically `JSON.stringify(filter)`) or the global version changes. **Keeps the previous `data` during a refetch** — never resets to `initial` mid-fetch, so a filter change never flashes an empty state. Guards against stale-response races with a `cancelled` flag closed over the effect.

---

## 8. Cross-context synchronization — the Android widget

The home-screen widget runs in a **separate JS context** (`react-native-android-widget`'s headless task), with its own module state — it is not the same running instance as the foregrounded app. It opens its own connection to the same `mercury.db` file via `db/client.ts#getDb()` directly (no `FinanceProvider`, no React tree available). `utils/widget-data-io.ts#logPreset()` writes a transaction through the exact same `insertTransaction` the app itself uses, so rollup/balance/stat correctness never depends on widget-specific write logic.

**The sync problem and its fix**: the widget's own `bumpDataVersion()` call bumps a *different* in-memory counter than the one the foregrounded app's React tree subscribes to (different JS context = different module state). The fix is not cross-process signaling — it's simpler: `context/finance-context.tsx`'s `AppState` listener calls `bumpDataVersion()` (in-process) on every transition to `'active'`, since that's the moment a widget tap could plausibly have just happened. Actual write-safety between the two connections comes from `PRAGMA busy_timeout=5000` plus native's `withExclusiveTransactionAsync`.

`utils/widget-bridge.ts` is the only file allowed to import `react-native-android-widget` (which throws via `TurboModuleRegistry.getEnforcing` if the native module isn't linked — e.g., under Expo Go). It probes support non-throwing first, registers the headless task at app entry, and exposes `refreshWidgets()` for the app to call after any write that changes what a widget displays.

---

## 9. What this app is *not*

To pre-empt likely-wrong assumptions: there is no server, no user login, no multi-device sync, no cloud backup (export/import is a manual, user-initiated local file operation), no telemetry, and no remote configuration. "Offline-first" is not a resilience feature layered on top of a networked app — it is the *only* mode the app has ever had.
