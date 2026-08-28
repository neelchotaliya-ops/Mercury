# Features

Layer 1 (Technical Bible) — code-level reference for AI agents and core
maintainers. Companion to `ARCHITECTURE.md` (tech stack, data layer),
`APP_FLOW.md` (routing), and `UI_BLUEPRINT.md` (components). This document
covers every feature in the app, linked to the concrete functions and
screens that implement it — including the newer feature set (recurring
rules, split expenses, subcategories, bank-statement import, widget
resizing) and OCR receipt scanning.

All file:line references are accurate as of commit `89a0e9b` on `main`.
Bugs and gaps found while reading the implementation are documented
explicitly, with the exact mechanism, not just flagged — this is what
distinguishes this document from a feature list.

---

## 1. Core CRUD features

| Feature | DB functions | Screen(s) |
|---|---|---|
| Accounts | `db/entities.ts`: `listAccounts`, `insertAccount`/`insertAccountRow`, `updateAccount`, `deleteAccount` | `app/accounts.tsx`, `app/add-account.tsx` |
| Categories | `db/entities.ts`: `listCategories`, `insertCategory`/`insertCategoryRow`, `updateCategory`, `deleteCategory` | `app/manage-categories.tsx` |
| Budgets | `db/entities.ts`: `listBudgets`, `insertBudget`, `updateBudget`, `deleteBudget`, `getBudgetProgress` | `app/add-budget.tsx` |
| Quick presets | `db/entities.ts`: `listPresets`, `insertPreset`, `updatePreset`, `deletePreset` | `app/quick-presets.tsx`, plus one-tap widget logging (§6) |
| Transactions | `db/transactions.ts`: `pageTransactions`, `getTransactionById`, `insertTransaction`, `bulkInsertTransactionRows`, `updateTransaction`, `deleteTransaction` | `app/add-transaction.tsx` |

`deleteAccount` (`db/entities.ts:101-113`) does not delta-reverse each
transaction's rollup contribution — it deletes the account row (letting
`ON DELETE CASCADE` remove its transactions/recurring rules), then calls
`rebuildRollups(db)` to fully recompute aggregates. This also means
**deleting an account silently cascades away any recurring rules tied to
it**, with no warning surfaced in the account-delete flow.

---

## 2. Recurring Rules (schema v4)

### Shape and date math

`RecurringRule` (`types/finance.ts:82-112`): `id, type (income|expense —
never transfer), amount, accountId, categoryId?, subcategoryId?, payee?,
note?, frequency, intervalUnit?, intervalValue?, dayOfWeek?, dayOfMonth?,
startDate, endDate?, nextDue, autoCreate, reminderDays, active, createdAt`.
`frequency: 'daily'|'weekly'|'monthly'|'yearly'|'custom'`; `intervalUnit`
only applies when `frequency === 'custom'`. Table: `db/schema.ts:219-245`.

All date math is pure, in `utils/recurring-engine.ts`:
- `computeNextDue(rule, after)` — the single source of truth for "next
  occurrence strictly after `after`": `daily` adds 1 day; `weekly` steps
  day-by-day to `rule.dayOfWeek` (falls back to `startDate`'s weekday);
  `monthly` walks forward month-by-month (max 13 attempts) with
  `clampDay`/`lastDayOfMonth` so `dayOfMonth = -1` means "last day of
  month" and day 31 clamps into shorter months; `yearly` anchors to
  `startDate`'s month/day, walks year-by-year (max 5 attempts), Feb 29
  clamps for non-leap years; `custom` adds `intervalValue * intervalUnit`.
- `isDue(rule, now, bufferDays)` — `startOfDay(now) >= startOfDay(nextDue - bufferDays)`.
- `generateOccurrences(rule, from, to, maxCount=60)` — preview list, used
  by the UI to show upcoming dates without touching the DB.

### Processing — `processDueRules(db, now, notify?)` (`db/recurring.ts:156-250`)

Runs once per call over every **active** rule:
1. Skips (and auto-pauses via `pauseRecurringRule`) a rule once `now` is
   past its `endDate`.
2. Computes `pastDue = isDue(rule, now, 0)` and, if not already past due,
   `inReminderWindow = isDue(rule, now, rule.reminderDays)`.
3. **`autoCreate && pastDue`**: inserts a real transaction dated at
   `rule.nextDue` (not "today"), runs it through `applyRow` (the same
   rollup/balance/stat writer `insertTransaction` uses), computes the new
   `next_due` via `computeNextDue`, bumps the data version.
4. **`!autoCreate && (pastDue || inReminderWindow)`**: fires a generic OS
   notification (`title`/`body` only — see gap below), and if `pastDue`,
   advances `next_due` regardless of whether the user acted on the
   reminder.

**Trigger**: foreground-only, via the `AppState` listener in
`FinanceProvider` (`context/finance-context.tsx:174-183`) — every
transition to `'active'` calls `processDueRules` best-effort. This is the
same listener that re-bumps the data-version counter to pick up widget
writes (§6), so recurring processing and widget-write sync piggyback on
the identical trigger.

### Known gaps

- **Manual rules never create a "pending transaction."** `types/finance.ts:103-106`
  documents `autoCreate: false` as creating "a 'pending' transaction the
  user must confirm." The implementation does not do this — the manual
  branch only fires a notification and advances `next_due`; no transaction
  row, pending or otherwise, is ever written. The notification itself
  carries no rule id or deep link (`utils/notifications.ts:63-75`, `content:
  { title, body }`, no `data`), so tapping it does not route anywhere.
  Combined with `next_due` advancing unconditionally once `pastDue` is
  true, a missed/dismissed manual reminder is **permanently lost** — no
  re-prompt, no catch-up, no linkage back to the rule for that occurrence.
- **Missed periods are not caught up.** `processDueRules` computes
  `pastDue` as a boolean and executes at most one create/reminder+advance
  per rule per call — there is no inner loop walking multiple elapsed
  periods. It fires once per foreground transition. If the app is closed
  for 3 months on a monthly rule, opening it advances `next_due` by
  exactly one month (handling only the oldest missed occurrence); the
  other two missed occurrences are silently skipped — never created, never
  reminded, never represented anywhere. Catching up fully would require
  multiple separate background→active cycles, which won't happen in one
  session. `processDueRules` does return a `ProcessingResult {created,
  reminded, skipped}`, but no caller surfaces it to the UI — the only
  consumer (`context/finance-context.tsx:181-186`) logs into a swallowed
  catch and discards the result.

### CRUD and UI wiring

`db/recurring.ts`: `listRecurringRules`, `listActiveRecurringRules`,
`getRecurringRule`, `insertRecurringRule`, `updateRecurringRule`,
`deleteRecurringRule` (relies on `ON DELETE SET NULL` on
`transactions.recurring_rule_id` to preserve past auto-created
transactions), `pauseRecurringRule`/`resumeRecurringRule`.
`getUpcomingPayments(rules, now, count, horizonDays)` feeds
`getRecurringInsights` (`db/insights.ts:520-557`).

`app/add-recurring.tsx` is the dual-mode hub+form screen (see
`APP_FLOW.md` §4.8 for the navigation mechanics). First-due computation on
create subtracts 1ms from `startDate` before calling `computeNextDue`, so
`startDate` itself is a valid first occurrence under the function's
"strictly after" semantics. `components/finance/recurring-insights.tsx`'s
"Monthly Commitment" hero normalizes weekly (×4.33), yearly (÷12), and
custom (÷intervalValue) frequencies to a monthly figure — the same rough
averaging is independently re-implemented a second time in
`app/add-recurring.tsx`, two separate copies of the same math. Also
reachable from `app/add-transaction.tsx`'s inline "Repeat" chip
(`RepeatSheet` → `insertRecurringRule`), which creates a recurring rule
alongside the one-off transaction at save time.

---

## 3. Split Expenses (schema v5)

Table: `split_participants` (`db/schema.ts:259-278`).
`transactions.split_expense_id` links a repayment transaction back to the
original bill.

### Mechanics

The shared bill is one ordinary `expense` transaction for the **full
amount**, paid from the payer's account, plus one `split_participants` row
per **non-payer** participant holding their `share_amount`. Splits never
participate in rollups — they're a side table keyed off `transaction_id`,
not a rollup dimension.

Two independent creation entry points exist:
- `app/add-split.tsx:144-188` (dedicated split screen) — correctly filters
  `!p.isYou` before inserting.
- `app/add-transaction.tsx:194-209` (inline "Split" chip, via
  `components/finance/split-sheet.tsx`) — passes participants
  **unfiltered**, including the "You" entry (see bug below).

**Share computation** (`utils/bank-statement.ts:276-300`,
`calculateSplitShares`): `equal` divides evenly to 2dp and dumps the
rounding remainder entirely onto the *last* participant by design;
`percentage` rounds each participant's share independently with no
renormalization if percentages don't sum to 100 (caught at the UI layer by
an `isBalanced` check requiring `|sum(shares) - total| < 0.05` before
save, not at the math layer); `custom` uses exact values, same balance
check.

**Repayment**: `recordRepayment(db, {...})` (`db/splits.ts:168-243`)
creates a linked `income` transaction with `split_expense_id` set (so it's
excluded from being treated as unexplained income elsewhere), runs it
through `applyRow`, and atomically updates the participant's
`paid_amount`/`status`. `newPaid = min(paid + amount, share_amount)` —
**overpayment is silently clamped**: paying more than the remaining share
caps `paid_amount` at `share_amount` with no surfaced warning, while the
full repayment amount is still deposited as income into the account — the
income transaction and the participant ledger can diverge by the clamped
delta.

**Status**: `pending` (`paid=0`) / `partial` (`0<paid<share`) / `paid`
(`paid>=share`) — computed explicitly on write, not a SQL-derived column.

**Settlement queries**: `getSplitSummary` runs a single aggregate over the
whole `split_participants` table (not pre-aggregated like `rollup` — every
call re-scans the table, acceptable at this table's expected size).
`listUnsettledSplits` selects distinct unpaid transaction ids, then does a
per-transaction participant fetch.

### Bug — "You" leaks into `split_participants` via the inline Add-Transaction flow

`components/finance/split-sheet.tsx`'s `handleApply` maps **all**
participants — including the always-index-0 `isYou: true` entry — into
its result with no filtering. `app/add-transaction.tsx` passes this
straight to `insertSplitParticipantsBatch`, explicitly intending to mark
the "You" row `paidAmount: p.isYou ? p.share : 0, status: p.isYou ? 'paid' : 'pending'`.
But `insertSplitParticipantsBatch` (`db/splits.ts:132-157`) builds each
row as `{ ...p, id: generateId(), paidAmount: 0, status: 'pending',
createdAt: now }` — the spread-then-override **unconditionally discards**
whatever `paidAmount`/`status` the caller passed, for every participant
including "You". Net effect: creating a split via the inline flow inserts
a phantom `split_participants` row for "You" that sits permanently
`pending`. This:
- inflates `getSplitSummary().totalOwed` by the payer's own share,
- makes "You" appear in `split-detail.tsx`'s participant list with a live
  "Collect" button that lets the user record a repayment from themselves
  to their own account,
- keeps the split perpetually "Pending" (`isFullySettled` requires
  `remainingOwed <= 0`, never true while "You"'s share sits unpaid) even
  after every real participant has paid.

The dedicated `app/add-split.tsx` screen does not have this bug (it
filters `!p.isYou` before calling the identical DB function) — this is a
genuine divergence between two creation paths that route through the same
function. Notably, `add-transaction.tsx`'s own chip-summary display
computes "owed" via `participants.slice(1)` (correctly excluding "You"),
so the display logic and the persistence logic already disagree about
whether "You" belongs in the split — the display was written correctly,
the persistence call site was not.

### Editing gap

Editing an existing split transaction only runs `updateTransaction` — no
participant re-sync happens if the amount or participant list changes. The
existing split link is surfaced as a read-only "Split Details" chip that
deep-links to `split-detail.tsx`, where the only participant-level
mutation available is recording a repayment, not re-splitting.

### UI wiring

`app/add-split.tsx`: bill amount/account/category/date, a
`SegmentedControl<SplitMethod>` (equal/custom/percentage), add/remove
participants (blocks going below 2 people, blocks removing "You"),
recent-friends autocomplete persisted to `AsyncStorage`
(`@mercury/recent_split_friends`). On save: `router.replace('/split-detail?id=...')`
(see `APP_FLOW.md` §4.9 for why `replace`, not `push`).
`app/split-detail.tsx`: collected/owed progress, per-participant "Collect"
→ repayment modal → `recordRepayment`, plus a "Settle All" bulk action
looping `recordRepayment` per unpaid participant.
`components/finance/split-insights.tsx`: pure display fed by
`getSplitInsights` (wraps `getSplitSummary` + `listUnsettledSplits`);
"Total Owed to You" = `totalOwed - totalSettled`, clamped to ≥0 for
display. `components/finance/split-sheet.tsx` is a second, independently
implemented copy of the equal/custom/percentage participant-management UI
— not shared code with `app/add-split.tsx`, just parallel logic.

---

## 4. Subcategories (schema v3)

Table: `subcategories` (`db/schema.ts:194-202`) — `id, category_id (FK→categories,
CASCADE), name, icon, color, is_default, sort_order`.
`transactions.subcategory_id` (`ON DELETE SET NULL`) added in the same
migration.

**Subcategories never flow into the rollup** — explicitly documented in
both `db/subcategories.ts`'s header and `db/schema.ts`'s migration
comment. The `rollup` table's key stays `(grain, bucket, account_id,
category_id)` with no subcategory dimension. Filtering/aggregating by
subcategory requires a bounded raw scan over `transactions` using
`idx_tx_subcat` — the same fallback pattern used for `payee`/`minAmount`
filters elsewhere. This is the one place the app's "never scan the ledger
to compute an aggregate" invariant is knowingly relaxed, by explicit
design, because subcategory-level numbers are rare/small-scale queries
relative to the account/category/date aggregates the rollup exists to serve.

### CRUD

`db/subcategories.ts`: `listSubcategories`, `listSubcategoriesByCategory`,
`insertSubcategory`, `updateSubcategory` (name/icon/color only, not
`categoryId`/`isDefault`), `deleteSubcategory` (relies on `ON DELETE SET
NULL`), `reorderSubcategories` (bulk `sort_order` rewrite in one
transaction). **`reorderSubcategories` has no UI caller anywhere in the
app** — `app/manage-subcategories.tsx` has no drag-to-reorder affordance
and never imports it. Dead code from the DB layer's perspective.

### UI

`app/manage-subcategories.tsx` is scoped to a single `categoryId` param
(see `APP_FLOW.md` §4.6 for how it's reached — only from
`add-transaction.tsx`'s "Add subcategory" chip); list + inline add/edit
form, delete gated behind a confirm alert that correctly informs the user
the parent category and its transactions are preserved.
`app/add-transaction.tsx` renders a horizontal subcategory-chip row once a
category is picked, filtered to that category's children, with a trailing
add-tile that deep-links to `manage-subcategories`. Picking a different
category resets `subcategoryId` to `undefined`, since subcategories are
scoped to one parent. Recurring rules and their auto-created transactions
correctly carry `subcategory_id` through end to end.

---

## 5. Bank Statement CSV Import

Separate and unrelated to Mercury's own backup CSV format (`utils/csv-stream.ts`,
§8) — this is a general bank-statement importer with column mapping,
built for statements the app didn't produce itself.

### Parsing — `utils/bank-statement.ts` (pure)

- `parseBankDate`: tries ISO, `DD/MM/YYYY`/`DD-MM-YYYY` (with a >12
  heuristic swap to MM/DD), `MM/DD/YYYY`, `DD-Mon-YY(YY)`.
- `parseBankAmount`: strips currency symbols/commas/whitespace, converts
  parenthesized negatives, returns `null` for empty/zero/NaN.
- `detectBankFormat(headers)`: header-name heuristics auto-detect
  split-debit/credit columns, amount+indicator columns, or a single
  signed-amount column; returns `null` (manual mapping required) if no
  date/description column is found.
- `parseBankRow`: resolves direction from whichever layout was chosen,
  skips opening/closing-balance narration rows, builds a
  `date|amount|direction` fingerprint used for both dedup and the review
  screen's row-exclusion set.
- `calculateSplitShares` also lives in this file, shared with §3 despite
  the file's bank-statement-focused name — a naming/location mismatch,
  not a functional bug.

### DB layer — `db/bank-import.ts`

`detectDuplicates` does a per-row bounded index query (same calendar day +
amount within ±0.50 + same type) — deliberately conservative; the user can
override flagged rows in the review UI. `applyBankImport` batches at 100
rows, drops/recreates the six secondary transaction indexes around imports
≥50 rows, mirroring the bulk-import fast path used elsewhere in the app.

### Confirmed bug — rollup writes use non-existent column names; every bank-imported transaction silently loses its aggregates

The real `rollup` schema has columns `grain, bucket, account_id,
category_id, income, expense, transfer_in, transfer_out, income_count,
expense_count, transfer_count`. `db/apply.ts` (the sole sanctioned writer,
per its own header: *"These are the only functions that touch rollup,
account_balance and ledger_stat"*) and `db/rebuild.ts` both use these exact
names, storing amounts as integer minor units (×100).

`db/bank-import.ts` bypasses `db/apply.ts` entirely and hand-rolls its own
SQL for both the monthly and daily grain:
```sql
INSERT INTO rollup (grain, bucket, account_id, category_id, income, expenses, count)
VALUES ('M', ?, ?, ?, ?, ?, 1)
ON CONFLICT (grain, bucket, account_id, category_id) DO UPDATE SET
  income   = income   + excluded.income,
  expenses = expenses + excluded.expenses,
  count    = count    + 1
```
**`expenses` and `count` are not columns of `rollup`** (the real schema has
`expense` singular and `income_count`/`expense_count`/`transfer_count`, no
bare `count`) — this statement fails with a "no such column" SQLite error
on every single row, every time. Even if the names were fixed, the values
passed are raw floats, not run through the `×100` minor-unit conversion
every other rollup writer uses — so it would additionally corrupt
aggregates by two orders of magnitude. It also never touches
`account_balance` or `ledger_stat` at all, unlike `applyRow`.

**Runtime consequence**: each row's insert order is `transactions` INSERT
(succeeds) → `rollup` 'M' INSERT (throws) → caught by a per-row `try {...}
catch { errors++; }` scoped inside the enclosing batch transaction. Because
the catch is per-row, the earlier successful `transactions` insert for
that row is **not rolled back** — the batch still commits. `imported` is
only incremented after all three writes succeed, so it's **never
incremented**; every row lands in `errors` instead. Net result:
bank-imported transactions are permanently written into `transactions`
with zero rollup/balance/stat contribution — invisible in Reports,
Insights, and account balances (which read only pre-aggregated tables per
the app's core architecture) while still present in any raw-scan
transaction list — and the returned `imported` count is `0` for a batch
that actually inserted N ledger rows.

**Compounding UI bug**: `app/bank-import.tsx` does
`setImportResult({ imported: result.imported, skipped: result.skipped })`,
dropping `result.errors` entirely — the "Import Complete!" screen shows
only `imported`/`skipped`, so the user sees "Successfully imported 0
transaction(s)" with no error indication at all, while N phantom,
un-aggregated transactions have already been silently committed. The only
fix path in the codebase is `rebuildRollups(db)` — but nothing in the
bank-import flow calls it, and the only user-facing way to trigger it is
via `app/db-diagnostics.tsx`, which (per `APP_FLOW.md` §4.12) has no
reachable entry point in the shipped UI. **This is currently the single
most severe functional bug documented across this feature set: the bank
import feature does not work at all, silently.**

### UI flow

`app/bank-import.tsx` is a 5-step wizard: pick file (`DocumentPicker` +
a local hand-rolled quoted-CSV parser sniffing the header row from the
first 10 lines) → map columns (`detectBankFormat` prefill, manual override
via chip pickers) → review (dedup badges, default-excluded flagged
duplicates) → import (`applyBankImport` with a progress callback) →
complete. Account and default-category selection happen at the mapping
step.

---

## 6. Widget Resizing / Android widgets

### Size-class logic — `widgets/widget-format.ts`

`quickLogSizeClass(width, height)`: `rows = height>=175 ? 2 : 1`;
`columns = width>=380 ? 4 : width>=300 ? 3 : 2`; estimates per-row tile
height (after a fixed 46px chrome allowance and inter-row gaps) to decide
`showAccountLine` (`perRowHeight >= 72`). `accountRowCapacity(height)`:
`min(4, floor((height-190)/32))`. `resolveWidgetSize(width, height)`:
`'small'` if `width<=250 || height<=130`; `'large'` if `width>=380 &&
height>=250`; else `'medium'`.

### Cross-JS-context data path

`widgets/widget-task-handler.tsx` (`widgetTaskHandler`) is the Android
headless-JS entry point, registered via `utils/widget-bridge.ts`'s
`registerWidgets` (gated by `isWidgetSupported()`, which probes
`TurboModuleRegistry`/`NativeModules` rather than unconditionally importing
`react-native-android-widget`). `WIDGET_ADDED`/`WIDGET_UPDATE`/`WIDGET_RESIZED`
are handled identically — all three just re-render via
`renderWidgetByInfo(props.widgetInfo)`, so a live drag-resize re-invokes
the same render path with new `width`/`height`, and both `QuickLogWidget`
and `QuickActionsWidget` pick their layout purely from those props each
time.

A `QUICK_LOG` tap calls `logPreset(presetId)` (`utils/widget-data-io.ts`),
which reads accounts/categories/presets straight from SQLite via
`getDb()` — no React tree, no `FinanceProvider`, hence the split from the
pure `utils/widget-data.ts` — builds the transaction via
`buildPresetTransaction` (pure: validates a positive amount and a
still-existing account, falling back to the highest-balance live account),
and inserts it through the **same** `insertTransaction` the app itself
uses, keeping rollup/balance/stat correct with no widget-special-case. The
widget then redraws itself immediately from the write's own result.

The app itself only learns about a widget write when it next transitions
to foreground: the widget tap bumps a data-version counter that lives in a
*separate* JS context's module state, so the app's own
`useSyncExternalStore` subscription never observes it directly — this is
why `FinanceProvider`'s `AppState` listener unconditionally re-bumps
`bumpDataVersion()` on every transition to `'active'`, specifically to
re-sync at the moment a widget tap could plausibly have just happened (see
`ARCHITECTURE.md` §8 for the full mechanism). `refreshWidgets()`
(`utils/widget-bridge.ts`) is the reverse direction — called from the app
after anything a widget displays changes; it fetches each placed widget's
*current* size before redrawing so the refresh renders at the size the
widget is already showing, not its smallest layout.

---

## 7. Receipt scanning / OCR

`utils/receipt-scan.ts` is on-device only — it binds the native
`ExpoTextExtractor` module via `requireOptionalNativeModule` rather than a
direct import, deliberately avoiding a module-scope throw in Expo Go or an
un-rebuilt dev client (the package stays in `package.json` purely for
autolinking even though nothing directly imports it). `isScanSupported()`
gates every entry point. `scanImage`/`pickAndScan`/`captureAndScan` wrap
`ImagePicker` + OCR + `parseReceipt`, returning a discriminated
`ScanResult` (`ok|no-text|canceled|denied|unsupported|error`) with
user-facing copy from `describeScanFailure`.

`utils/receipt-parser.ts`'s `parseReceipt` is a pure line-heuristics parser
tuned for UPI/GPay/PhonePe/Paytm screenshots:
- `extractAmount` scores candidate amount lines (currency symbol,
  isolation on the line, position, penalizes cashback/fee/balance
  mentions, rejects >9-digit "amounts" as reference IDs).
- `extractDirection` matches expense/income marker phrases, with a
  first-appearance tiebreak when both are present.
- `extractMerchant` handles both inline (`"Paid to Swiggy"`) and
  next-line marker styles.
- `extractDate` tries month-name, numeric `DD/MM/YYYY`, ISO, and relative
  "yesterday/today" in that order.
- `extractRefId`/`extractBankHint` pull reference numbers and bank hints.
- `confidence` is a simple additive score (amount 0.5 + direction-matched
  0.2 + merchant 0.2 + date 0.1) — **not surfaced anywhere in the UI**:
  `add-transaction.tsx` stores `{merchant, confidence}` in local state for
  a banner but never gates behavior on or displays the numeric confidence
  value.

`utils/receipt-match.ts`: `guessCategory` does a longest-keyword-wins match
over a hardcoded merchant/income keyword table against the merchant + OCR
lines, then matches against the user's live categories by **name string
equality** — if the user has renamed or deleted the seed category the
keyword table assumes, the guess silently returns nothing (acknowledged in
a code comment). `guessAccount` scores accounts by matching distinctive
name words against the receipt's bank-hint line, with a strong bonus for a
matching last-4-digit card/account tail.

Wired into `app/add-transaction.tsx`'s `applyScanResult`/`runScan`:
prefills type/amount/date/note/payee, calls `guessCategory`/`guessAccount`
to prefill those pickers, falls back to the first account if no guess
succeeds. This is a fully separate code path from `useSharedReceipt`'s
share-intent flow documented in `APP_FLOW.md` §6 — that flow's `imageUri`
param is never actually wired into this OCR pipeline (a confirmed dead
path, see that document).

---

## 8. CSV/JSON backup import-export (Mercury's own format)

Fully documented in `ARCHITECTURE.md` (§3.6, §6) — noted here only as a
pointer, since this is a distinct pipeline from bank-statement import
(§5): different file format, different dedup semantics (id-based merge vs.
fingerprint-based duplicate detection), and different DB entry points
(the bulk-insert paths in `db/transactions.ts` rather than
`db/bank-import.ts`). Implementation: `utils/data-transfer.ts` (format and
validation, pure), `utils/data-transfer-io.ts` (file/share-sheet I/O),
`utils/csv-stream.ts` and `utils/import-stream.ts`/`utils/json-stream.ts`
(streaming readers shared across both the CSV and legacy JSON formats).
