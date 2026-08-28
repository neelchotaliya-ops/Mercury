# App Flow

Layer 1 (Technical Bible) — code-level reference for AI agents and core
maintainers. Companion to `ARCHITECTURE.md` (tech stack, state, data layer)
and `UI_BLUEPRINT.md` (component trees, styling). This document covers: the
exact cold-start execution path, every route's purpose/params/entry-exit,
the real navigation graph (grep-verified, not inferred), deep-linking /
share-intent mechanics, and how the app behaves when something fails.

All file:line references are accurate as of commit `89a0e9b` on `main`.
Where the app's actual behavior deviates from what a file's own comments or
naming imply, that deviation is called out explicitly — this document
describes what the code does, not what it was intended to do.

---

## 1. Cold-start sequence

Two splash phases exist and must not be confused: a **native** splash
(handled by `expo-splash-screen`, invisible bridge-boot bridge) and a **JS**
splash (`AppSplash`, a real component that always renders for at least one
fade-out duration).

```
1. Module load: SplashScreen.preventAutoHideAsync()          [_layout.tsx:32]
   → native splash held up before any component exists.

2. RootLayout() runs useFonts([...8 Sora/Manrope weights])   [_layout.tsx:93]
   → while (!fontsLoaded && !fontError): return null.        [_layout.tsx:104-106]
     Nothing mounts yet — native splash still showing.

3. Fonts resolve (loaded or errored) → provider tree mounts: [_layout.tsx:110-118]
     <ShareIntentProvider>
       <FinanceProvider>          ← starts its own async load effect, see §2
         <AppThemeProvider>
           <RootNavigator />
         </AppThemeProvider>
       </FinanceProvider>
     </ShareIntentProvider>

4. RootNavigator mounts. One-time effect fires:              [_layout.tsx:42-50]
     a. SplashScreen.hideAsync().catch(() => {})              — native → JS handoff,
        fires immediately, NOT gated on FinanceProvider's data load.
     b. void ensureNotificationsReady()                       — fire-and-forget;
        requested eagerly (not lazily on first completed op) so the OS
        permission is already granted by the time a background operation
        finishes while the app is backgrounded.

5. useSharedReceipt(state.isLoaded && state.settings.hasOnboarded)  [_layout.tsx:53]
   called unconditionally every render; no-ops internally while its
   `enabled` argument is false. See §6.

6. Render:                                                    [_layout.tsx:55-89]
     {state.isLoaded ? <Stack>...</Stack> : null}
       → before FinanceProvider finishes loading, NO navigator exists at
         all, just an empty <View>.
     <AppSplash isReady={state.isLoaded}
                onAnimationComplete={() => setSplashDone(true)} />
       → renders until local `splashDone` state flips true.
     <PersistErrorBanner /> <BackgroundOperationBanner />
       → always mounted, independent of isLoaded/splashDone.
```

**`AppSplash`** (`components/ui/app-splash.tsx`): full-bleed white overlay
(`StyleSheet.absoluteFillObject`, `zIndex: 9999`) with a centered logo and
version string, `pointerEvents={isReady ? 'none' : 'auto'}`. A `useEffect`
watches its `isReady` prop; when it flips true, it fades `opacity` to 0 via
`withTiming(0, {...}, finished => runOnJS(onAnimationComplete)())`. Only
after that fade **completes** does `RootNavigator` set `splashDone = true`
and unmount `AppSplash`. Net effect: the JS splash is shown for at least one
fade-duration no matter how fast `FinanceProvider` loads, and the real
`<Stack>` can already exist and be mounted underneath it during the fade.

**Why `ShareIntentProvider` wraps everything** (comment, `_layout.tsx:108-109):
so the native share-intent module is reachable even on a cold start
triggered by an incoming Android/iOS share — if it were nested inside
`FinanceProvider`/`AppThemeProvider`, `useShareIntentContext()` (consumed by
`useSharedReceipt`, called unconditionally in `RootNavigator`) would not be
guaranteed available.

---

## 2. `FinanceProvider` mount sequence

`context/finance-context.tsx`.

1. Initial state: `isLoaded: false`, all entity arrays empty,
   `defaultSettings = { currency: 'USD', hasOnboarded: false }` (lines 116, 148-156).
2. `dataVersion = useSyncExternalStore(subscribeDataVersion, getDataVersion, getDataVersion)`
   (line 163) — the load effect below re-runs whenever **any** write anywhere
   (this context's own actions, the Android widget's headless JS task, a
   direct-SQL screen like `manage-subcategories.tsx`) bumps the shared
   version counter (`db/version.ts`).
3. An `AppState` listener (lines 173-198):
   - on `'active'`: `bumpDataVersion()` (in case the widget wrote while
     backgrounded — see `ARCHITECTURE.md` §8) and best-effort
     `processDueRules(db, new Date(), notifyOperationComplete)` (auto-creates
     due recurring transactions / posts reminders).
   - on `'background'`: best-effort `checkpoint()` (`PRAGMA wal_checkpoint(TRUNCATE)`)
     so Android's Auto Backup doesn't snapshot a database with unflushed WAL writes.
4. Main load effect (lines 200-268), re-run on every `dataVersion` change:
   1. `const db = await getDb()` — see §3.
   2. `Promise.all([accounts, categories, budgets, quickPresets, settings])`,
      then `subcategories` fetched separately (kept out of the tuple so the
      existing destructure didn't need reordering).
   3. **First-launch seeding** (lines 220-250) — only when the DB is truly
      empty (`categories.length === 0 && accounts.length === 0 &&
      quickPresets.length === 0`, not just one empty subset): seeds default
      expense/income categories, 4 widget quick-presets (Coffee/Commute/
      Groceries/Snacks), and one default "Cash" account (green `#22C55E`,
      `initialBalance: 0`). This happens **before** `isLoaded` is set.
   4. Otherwise, loads whatever already exists.
   5. Either branch ends with `setEntities({ ..., isLoaded: true })`.
   6. `getBlobMigrationResult()` is awaited and `migrationFailed` set
      **after** `isLoaded` is already true (lines 255-256) — so it can flip
      on a later render and never blocks first paint. **`migrationFailed` is
      exposed on `FinanceContextValue` but is not read by any UI component
      in the shipped app** — see §7 for the consequence.
   7. On any thrown error (lines 257-262): `setPersistError(message)` **and
      still** forces `isLoaded: true` — a load failure never hangs the splash;
      the app renders with empty/default entity state and the
      `PersistErrorBanner` visible.
5. `withDb()` (lines 270-284) wraps every mutating action (`addAccount`,
   `updateTransaction`, etc.): on success, clears `persistError`; on failure,
   sets `persistError` to the error message and rethrows so the calling
   screen's own local `try/catch`/`Alert` can also react.

---

## 3. `getDb()` — connection open sequence

`db/client.ts`.

- `getDb()` (lines 186-196) memoizes a single `openPromise` so concurrent
  callers on cold start share one open; on failure the cached promise is
  cleared so the next caller retries fresh.
- `open()` (lines 91-112), in order:
  1. `SQLite.openDatabaseAsync('mercury.db')`.
  2. Pragmas: `journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL`,
     `busy_timeout=5000`, `temp_store=MEMORY`.
  3. `applyMigrations(db)` — see `ARCHITECTURE.md` §4 for the full v1-v5 schema history.
  4. `ensureBulkIndexes(db)` — repairs the 7 transaction-table indexes if a
     prior bulk-load (fill-test-data / import) was killed mid-run before
     rebuilding them.
  5. `runBlobMigration(db)` — one-time import of the legacy single-key
     AsyncStorage blob (pre-SQLite storage format) into SQLite, gated by
     `meta.blob_migration_state` so it only ever runs once.
- `runBlobMigration` (lines 125-161): on success, archives the raw legacy
  bytes under a `_backup` key and deletes the original; on failure
  (unparseable data), **quarantines** the raw bytes under a `_quarantine`
  key rather than deleting them — the bytes are never destroyed, only
  orphaned from the UI (§7).
- `checkpoint()` (lines 205-208): `PRAGMA wal_checkpoint(TRUNCATE)`, called
  on app backgrounding.

---

## 4. Route inventory

`Db` = declared in `app/_layout.tsx`'s `<Stack>` with an explicit
`<Stack.Screen>` entry (gets `presentation: 'modal'` unless noted).
`Un` = **not** declared — expo-router auto-registers every file under `app/`
regardless, but an undeclared screen only inherits the Stack's default
`screenOptions` (`headerShown: false`, transparent background) and **not**
`presentation: 'modal'`. See §4.9 for the consequence.

| Route | Decl. | Params | Purpose |
|---|---|---|---|
| `app/index.tsx` | Db (anchor, non-modal) | — | Onboarding / entry redirect |
| `app/(tabs)/_layout.tsx` | Db (`"(tabs)"`, non-modal) | — | Bottom-tab navigator shell |
| `app/(tabs)/index.tsx` | tab child | — | Home |
| `app/(tabs)/transactions.tsx` | tab child | — | Activity (transaction list) |
| `app/(tabs)/budgets.tsx` | tab child | — | Budgets |
| `app/(tabs)/reports.tsx` | tab child | — | Insights (Spending/Recurring/Splits) |
| `app/accounts.tsx` | Db, modal | — | Accounts list |
| `app/add-transaction.tsx` | Db, modal | `id?`, `fromScan?`, `imageUri?` | Add/edit a transaction |
| `app/add-account.tsx` | Db, modal | `id?` | Add/edit an account |
| `app/add-budget.tsx` | Db, modal | `id?` | Add/edit a budget |
| `app/manage-categories.tsx` | Db, modal | `kind?` | Category CRUD |
| `app/manage-subcategories.tsx` | **Un** | `categoryId` (required) | Subcategory CRUD |
| `app/quick-presets.tsx` | Db, modal | — | Widget quick-preset CRUD |
| `app/settings.tsx` | Db, modal | — | Settings hub |
| `app/add-recurring.tsx` | **Un** | `id?`, `amount?`, `type?`, `accountId?`, `categoryId?`, `subcategoryId?`, `payee?`, `note?` | Recurring-rule hub + form |
| `app/add-split.tsx` | **Un** | `amount?`, `accountId?`, `categoryId?`, `payee?`, `note?` | Create a split expense |
| `app/split-detail.tsx` | **Un** | `id` (required, transaction id) | Split settlement / repayment tracker |
| `app/bank-import.tsx` | **Un** | — | Bank-statement CSV importer |
| `app/fill-test-data.tsx` | Db, modal | — | Bulk synthetic-data generator (QA tool) |
| `app/db-diagnostics.tsx` | Db, modal | — | DB health/diagnostics (see §4.9 — orphaned) |

### 4.1 `app/index.tsx` — Onboarding

- If `state.settings.hasOnboarded`: `<Redirect href="/(tabs)" />` immediately —
  no onboarding flash.
- Otherwise: 3-slide carousel (`SLIDES`) with back (only past slide 0), Skip
  (calls `finish()` directly), and a CTA that calls `next()`.
- `finish()`: `completeOnboarding()` (not awaited) then
  `router.replace('/(tabs)')` — the settings write and the navigation are not
  sequenced; harmless since `hasOnboarded` only affects this screen's own
  redirect on a *future* mount.
- This is `unstable_settings.anchor` (`_layout.tsx:35`) — expo-router's
  designated "home" route for deep-link back-stack construction.

### 4.2 `app/(tabs)/*` — the four tabs

`app/(tabs)/_layout.tsx` renders `<Tabs tabBar={props => <FloatingTabBar {...props} />}>`
with `headerShown: false`, `sceneStyle: {backgroundColor: 'transparent'}`,
and an explicit `animation: 'shift'` — the default `'none'` read as "sudden"
next to the Stack's animated push/modal transitions used everywhere else in
the app (code comment). Four screens: `index` (Home), `transactions`
(Activity), `budgets` (Budgets), `reports` (Insights); each supplies a
`TabGradientIcon`.

- **Home** (`(tabs)/index.tsx`): `useAccountBalances()`,
  `useMonthSummary(monthKey, selectedAccountId)`,
  `useRecentTransactions(selectedAccountId, 5)`. Local UI state: account
  filter chip, currency. Navigates to `/settings` (gear), `/accounts`
  ("Manage" link / chip tap), `/add-account` ("Add" chip),
  `/(tabs)/transactions` ("See all"), `/add-transaction?id=<id>` (row tap).
- **Activity** (`(tabs)/transactions.tsx`): filter/search state drives
  `useTransactionPage(dbFilter, 60)` — a keyset-paginated SQL query, never an
  in-memory array. Row tap → `/add-transaction?id=<id>`.
- **Budgets** (`(tabs)/budgets.tsx`): `useBudgetProgress(monthKey, activeCurrency)`.
  "+" icon / empty-state CTA → `/add-budget`; row tap → `/add-budget?id=<id>`.
- **Insights** (`(tabs)/reports.tsx`): a `'spending'|'recurring'|'splits'`
  segmented control switches between three views. Loads recurring/split
  insight data itself via `getDb()` directly, independent of `useFinance()`.
  Has **no `router.push` calls of its own** — navigation lives one level
  down in `RecurringInsightsView` and `SplitInsightsView`.

### 4.3 `app/accounts.tsx` — Accounts list

Modal, no params. Header close (chevron icon, not the usual ✕, despite
being a `presentation: 'modal'` screen) → `router.back()`. Empty-state /
"Add account" tile → `/add-account`. Card tap → `/add-account?id=<id>`.
"Transfer" tile (shown only when `accounts.length >= 2`) →
`/add-transaction?type=transfer` — **the `type` param is declared nowhere
in `add-transaction.tsx`'s param type and is never read; the transfer tile
opens a plain blank new-transaction form, not a form pre-set to the
Transfer type.**

### 4.4 `app/add-transaction.tsx` — Add/edit transaction

Modal. Params: `{ id?, fromScan?, imageUri? }`. `id` present → loads the
transaction + its split participants and switches to edit mode (title,
delete affordance). **`fromScan` and `imageUri` are declared in the param
type but never read anywhere in the component body** — manual receipt
scanning is wired independently via the header "Scan" button
(`captureAndScan`/`pickAndScan` → `applyScanResult`), not through these
params. See §6 for why this matters (the share-intent flow depends on
`imageUri` and is currently a dead path).

Reached from: `FloatingTabBar`'s center "+" (blank, no params), Home/Activity
row taps (`?id=`), Accounts' Transfer tile (`?type=transfer`, unused),
`useSharedReceipt` (`?imageUri=`, unused).

Internal pushes: category picker "manage" → `/manage-categories?kind=<type>`;
subcategory "Add" chip → `/manage-subcategories?categoryId=<id>`; existing-split
chip → `/split-detail?id=<id>`. Exit: Save/Delete/✕ → `router.back()`.

### 4.5 `app/add-account.tsx`, `app/add-budget.tsx` — simple CRUD modals

Both: `{ id? }` param, prefill on `id` present, no internal navigation other
than (`add-budget.tsx` only) category-picker "manage" →
`/manage-categories?kind=expense`. Both exit purely via `router.back()` on
Save/Delete/✕ — no `push`/`replace` anywhere in either file.

### 4.6 `app/manage-categories.tsx`, `app/manage-subcategories.tsx`, `app/quick-presets.tsx` — leaf CRUD screens

- **`manage-categories.tsx`** (modal, `{ kind? }` pre-selects Spending vs
  Income): reached from `add-transaction`, `add-budget`, `add-recurring`,
  `add-split` (all pass `?kind=`), Settings and `bank-import` (no `kind`).
  All CRUD in-place; ✕ → `router.back()`.
- **`manage-subcategories.tsx`** (undeclared, `{ categoryId }` required):
  reached **only** from `add-transaction.tsx`'s "Add subcategory" chip — no
  other caller exists. Writes go straight through `db/subcategories.ts` +
  `bumpDataVersion()`, **bypassing `FinanceContext`'s `withDb`/`persistError`
  wrapper entirely** — a save failure here shows a local `Alert.alert`
  instead of the app-wide `PersistErrorBanner`, an inconsistency with every
  other write path in the app.
- **`quick-presets.tsx`** (modal, no params): reached from Settings. On
  save/delete, calls `refreshWidgets()` to redraw any placed Android
  home-screen widgets. ✕ → `router.back()`.

### 4.7 `app/settings.tsx` — Settings hub

Modal, no params. Reached from Home's gear icon and from
`PersistErrorBanner`'s tap target. Fans out to `manage-categories`,
`accounts`, `add-recurring` (no params → opens in hub/list mode, not the
form), `quick-presets`, `bank-import`, `fill-test-data` — all six via plain
`router.push`. Also drives non-navigational operations through the shared
`db/operation-status.ts` store: Export, Import (merge/replace `Alert`, with
`onDismiss` handling Android's back-gesture cancelling the alert without a
button firing — otherwise the operation would stay stuck "active" forever),
Reset all data. All rows are `disabled={busy !== null}` while any operation
runs. **No link to `db-diagnostics` exists on this screen or anywhere else**
(§4.9). ✕ → `router.back()`.

### 4.8 `app/add-recurring.tsx` — Recurring-rule hub + form (dual-mode)

Undeclared. `isFormOpen` initial state is
`Boolean(params.id || params.amount || params.payee || params.categoryId)`
— **any** prefill param opens straight into the create/edit form; otherwise
renders a list/hub view (monthly-commitment hero card + all rules, "New
Rule" button) first. Reached from Settings (no params → hub) and from
`RecurringInsightsView`'s empty-state/"+ Add New" (no params → hub) and
per-rule tap (`?id=` → form directly). **`amount`/`type`/`accountId`/
`categoryId`/`payee`/`note` are read from params but no call site in the
codebase currently supplies them** — only `id` is ever actually passed by a
live navigation; the "prefill a new rule from an existing transaction" path
these params imply does not currently exist anywhere in the UI.

Close/exit asymmetry: the form-mode header's close handler always closes
the in-page form (`setIsFormOpen(false)`), but only additionally calls
`router.back()` **if `params.id` was set** — i.e. only pops the whole screen
if it was entered directly into edit mode via a route param. Opened via the
hub's "New Rule" button (no param), closing the form just reveals the hub
again in the same screen instance, no navigation event. Saving an edit
opened via `?id=` also does **not** call `router.back()` afterward (only the
close-✕ handler does that check) — it returns to the hub view within the
same instance, unlike every other edit screen in the app (`add-account`,
`add-budget`, `add-transaction`), which always `router.back()` after a save.

### 4.9 `app/add-split.tsx`, `app/split-detail.tsx` — split-expense flow

- **`add-split.tsx`** (undeclared, `{ amount?, accountId?, categoryId?,
  payee?, note? }`, same "never actually supplied by a caller" caveat as
  §4.8): reached from `SplitInsightsView`'s empty-state/"+ Split New". On
  save: inserts the expense transaction + split-participant rows, then
  **`router.replace({ pathname: '/split-detail', params: { id: transactionId } })`**
  — a `replace`, not a `push`, so the form is removed from the stack;
  backing out of the resulting `split-detail` screen returns to wherever the
  user was *before* opening `add-split`, not to the (now-saved) form. ✕ →
  `router.back()`.
- **`split-detail.tsx`** (undeclared, `{ id }` required — a transaction id):
  reached from `add-split`'s post-save replace, `SplitInsightsView`'s
  per-row tap, and `add-transaction.tsx`'s "Split Details" chip on an
  editing transaction that already has participants. Repayment recording
  happens via an in-page `<Modal>` writing directly to SQLite, not a route.
  ✕ → `router.back()`.

### 4.10 `app/bank-import.tsx` — CSV bank-statement importer

Undeclared, no route params. Entirely local step-machine state (`'pick' |
'map' | 'review' | 'importing' | 'complete'`). Reached from Settings'
"Import bank statement (CSV)" row. Internal category-picker "manage" →
`/manage-categories` (no `kind` — this importer only deals in expenses).
✕ at any step → `router.back()`; **"Done" on the complete step also just
`router.back()`s** rather than a `dismissTo`, so a completed import still
only pops one screen (back to Settings) — it does not clear any other
screens that might be stacked above Settings.

### 4.11 `app/fill-test-data.tsx` — Bulk synthetic-data generator

Modal, no params. Reached from Settings ("Fill test data (custom size)").
Runs `seedScaleData` through the shared `startOperation('fill-test-data', ...)`
store so `BackgroundOperationBanner` keeps reflecting progress **even if
this screen is dismissed mid-run** — closing it (header ✕, `router.back()`)
does not cancel the seed. Post-run "Done" → `router.back()`.

### 4.12 `app/db-diagnostics.tsx` — orphaned diagnostics screen

Modal, no params. **This screen has zero reachable UI entry points anywhere
in the shipped app.** A full-repo search for `"db-diagnostics"` outside
`node_modules` returns exactly one hit — the `<Stack.Screen name="db-diagnostics" />`
declaration in `app/_layout.tsx` itself. No `router.push`, no `<Link>`, no
button anywhere links here; it is reachable only via a manually-typed deep
link (`mercury://db-diagnostics`) during development. On mount it runs a
real round-trip health check (SQLite version, `PRAGMA journal_mode`,
table/index counts, `ledger_stat` row count, a live insert-and-readback,
and blob-migration status) — it is the **only** place in the app that
surfaces `getBlobMigrationResult()` to a human, and that place is
unreachable in normal use. Uses the same back-chevron `closeIcon` as
`accounts.tsx` (→ `router.back()`).

---

## 5. The 5 undeclared routes — practical effect

`manage-subcategories.tsx`, `add-recurring.tsx`, `add-split.tsx`,
`split-detail.tsx`, `bank-import.tsx` have no `<Stack.Screen>` entry in
`app/_layout.tsx`. expo-router auto-registers every file under `app/` as a
valid route regardless of whether it's explicitly declared — the explicit
entries exist purely to attach per-screen `options`, here `presentation:
'modal'`. An undeclared screen renders inside the same root `<Stack>` and
inherits only the Stack's `screenOptions` defaults (`headerShown: false`,
transparent background), **not** `presentation: 'modal'`.

**Observable effect**: on the default stack `presentation` (`'card'`),
navigating to any of these 5 screens animates as a horizontal push/slide
rather than the bottom-sheet modal slide-up with translucent scrim that the
8 declared modal screens get — even though all 5 use the exact same
`<ModalHeader onClose={() => router.back()}>` + full-bleed `<GradientScreen>`
layout as the declared modals, and were clearly authored to *be* modals.

No caller compensates: none of the `router.push` call sites for these 5
routes pass navigation options (expo-router's imperative `router.push` API
doesn't accept a per-call `presentation` override the way React Navigation's
`navigate(name, params, options)` does), and none of the 5 screens render a
local `<Stack.Screen options={{presentation: 'modal'}}>` element themselves
(a pattern expo-router does support for this exact case). The inconsistency
is real, current, and unmitigated as of `89a0e9b`.

---

## 6. Deep linking & share-intent

`app.json`:
```json
["expo-share-intent", {
  "iosActivationRules": { "NSExtensionActivationSupportsImageWithMaxCount": 1 },
  "androidIntentFilters": ["image/*"]
}]
```
plus `"scheme": "mercury"`, which registers a generic `mercury://` deep-link
scheme (how e.g. `mercury://db-diagnostics` would be dispatched, independent
of share-intent).

`androidIntentFilters: ["image/*"]` puts Mercury in Android's share sheet
for any image share (e.g. sharing a payment screenshot from the gallery).
iOS is configured to activate its share extension when exactly one image is
shared.

### `hooks/use-shared-receipt.ts`

```
useSharedReceipt(enabled: boolean): void
```
called unconditionally from `RootNavigator` with
`enabled = state.isLoaded && state.settings.hasOnboarded`.

- Guard: `if (!enabled || !hasShareIntent) return;` — a pending share is held
  until the DB has loaded **and** onboarding is complete.
- Filters `shareIntent.files` for the first `mimeType` starting with
  `'image/'`. If none (a shared text/link), calls `resetShareIntent()` and
  returns — **text/link shares are silently discarded**, no error shown.
- De-dupe: a `handledPath` ref tracks the last-handled image path so
  re-entering the app (backgrounding/foregrounding) doesn't replay the same
  intent twice.
- On a match: `router.push({ pathname: '/add-transaction', params: { imageUri: image.path } })`
  then `resetShareIntent()`.
- Does not distinguish cold-start vs warm-start explicitly — `expo-share-intent`
  populates `hasShareIntent`/`shareIntent` the same way in either case; the
  effect just re-fires whenever `enabled`/`hasShareIntent`/`shareIntent`
  change, so a cold start simply means the `enabled` gate holds the push
  until `FinanceProvider`'s async load (§2) finishes.
- Does no account/category matching itself, despite its own doc comment
  ("routes to add-transaction, which runs OCR on it and prefills the form")
  implying otherwise.

**Confirmed dead path**: `add-transaction.tsx` declares `imageUri` in its
param type (§4.4) but never reads it anywhere in the component — there is
no effect that picks it up and runs OCR/prefill. **The shared-screenshot
flow does not currently work**: the screen opens as a blank new-transaction
form and the shared image is discarded once `resetShareIntent()` runs. The
manual "Scan" button flow (`captureAndScan`/`pickAndScan` → `scanImage` →
`applyScanResult`) is fully implemented and unaffected — it's simply a
separate, unconnected code path from the share-intent one.

**Cold-start-by-share sequence** (Android):
1. User shares a screenshot into Mercury from another app.
2. Android launches Mercury's process with the share `Intent` attached,
   matched by the `image/*` intent filter.
3. Normal JS bootstrap proceeds exactly as in §1.
4. `expo-share-intent`'s native module resolves the pending intent into
   `useShareIntentContext()`, independently of and possibly before
   Mercury's own DB load finishes.
5. `useSharedReceipt`'s effect stays inert until `enabled` flips true, then
   fires the push using whatever `shareIntent` value is still in context.
6. If the user is not yet onboarded, the share intent sits pending until
   onboarding completes and `hasOnboarded` flips true on a later render.
7. End state (given the dead-path finding above): Mercury opens normally,
   then auto-navigates to a **blank** "New transaction" modal once
   loaded+onboarded — the shared image is silently dropped.

---

## 7. Tab bar — `components/navigation/floating-tab-bar.tsx`

Receives standard React Navigation `BottomTabBarProps`; passed as the
`tabBar` render-prop to `<Tabs>`, fully replacing native tab-bar chrome
while still driving the real tab navigator underneath.

- **Layout**: `state.routes` split into `left = routes.slice(0, half)` /
  `right = routes.slice(half)` (`half = Math.ceil(routes.length / 2)`), with
  a fixed center "+" action rendered between them — not a 5th tab route.
  With 4 tabs: `left` = [Home, Activity], `right` = [Budgets, Insights].
- **Active state**: `focused = state.index === index`, the standard React
  Navigation tab index — no custom logic.
- **Press**: emits `tabPress` via `navigation.emit` (so screen-level
  listeners can `preventDefault()`), and only calls `navigation.navigate(route.name)`
  if the tab isn't already focused. **Tapping the already-active tab does
  nothing** — no scroll-to-top / reset-to-root behavior is implemented,
  unlike the default React Navigation tab bar's double-tap-to-pop.
- **Haptics**: every tab tap fires `haptics.selection()` regardless of
  whether navigation actually happens (i.e. tapping the active tab still
  gives haptic feedback for a no-op). The center "+" fires a distinct,
  stronger `haptics.press()`.
- **Center action**: `onPress={() => router.push('/add-transaction')}` —
  always a blank new-transaction modal, regardless of which tab is active.
  This is the tab bar's only `router` call.
- **Icon rendering**: delegates to each tab's `tabBarIcon`, which renders a
  hand-drawn SVG path (`TabGradientIcon`) with a purple→pink linear-gradient
  stroke when focused, flat gray otherwise.
- **Visibility**: no hide/show logic lives in this file — it renders
  whenever the nested `(tabs)` `<Tabs>` navigator is the active screen
  (i.e. on all 4 tab screens) and is simply absent whenever any root-`<Stack>`
  screen outside `(tabs)` is on top (any modal). `BackgroundOperationBanner`
  separately reads `useSegments()` purely to reposition *itself* above the
  bar's 64px height when `(tabs)` is active — it doesn't affect the bar.

---

## 8. Navigation edge list (full screen graph)

```
Home (tabs/index)
 ├─→ /settings                                (gear icon)
 ├─→ /accounts                                 ("Manage" link / account chip)
 ├─→ /add-account                              ("Add" chip)
 ├─→ /(tabs)/transactions                      ("See all")
 └─→ /add-transaction?id=<id>                  (recent-tx row)

Activity (tabs/transactions)
 └─→ /add-transaction?id=<id>                  (row tap)

Budgets (tabs/budgets)
 ├─→ /add-budget                               ("+" / empty-state CTA)
 └─→ /add-budget?id=<id>                       (row tap)

Insights (tabs/reports)  — no direct pushes of its own
 ├─ RecurringInsightsView
 │   ├─→ /add-recurring                        (empty-state / "+ Add New")
 │   └─→ /add-recurring?id=<ruleId>             (rule row tap)
 └─ SplitInsightsView
     ├─→ /add-split                            (empty-state / "+ Split New")
     └─→ /split-detail?id=<txId>                (split row tap)

FloatingTabBar (visible on all 4 tabs)
 └─→ /add-transaction                          (center "+" — always blank)

PersistErrorBanner (root-mounted, visible on any screen when persistError set)
 └─→ /settings                                 (tap)

Accounts (/accounts)
 ├─→ /add-account                              (empty-state / "Add account" tile)
 ├─→ /add-account?id=<id>                      (card tap)
 └─→ /add-transaction?type=transfer            ("Transfer" tile — param unused)

Add/Edit Transaction (/add-transaction)
 ├─→ /manage-categories?kind=<income|expense>
 ├─→ /manage-subcategories?categoryId=<id>
 └─→ /split-detail?id=<id>                     (existing-split chip)

Settings (/settings)
 ├─→ /manage-categories
 ├─→ /accounts
 ├─→ /add-recurring                            (no params → hub view)
 ├─→ /quick-presets
 ├─→ /bank-import
 └─→ /fill-test-data

Add Recurring (/add-recurring)
 └─→ /manage-categories?kind=<type>

Add Split (/add-split)
 ├─→ /manage-categories?kind=expense
 └─→ /split-detail?id=<txId>                   (router.replace, on save)

Add Budget (/add-budget)
 └─→ /manage-categories?kind=expense

Bank Import (/bank-import)
 └─→ /manage-categories

Leaf screens (no outbound navigation):
  manage-categories, manage-subcategories, quick-presets,
  split-detail, fill-test-data, db-diagnostics, add-account
```

The only `<Link>` usage anywhere in `app/`+`components/` is
`components/external-link.tsx`, which opens an **external** URL via
`WebBrowser.openBrowserAsync` — not part of the internal screen graph.

---

## 9. Back-navigation conventions

Every dismissible screen uses `router.back()` — invoked from a
`ModalHeader`'s `onClose` prop, or an equivalent explicit ✕/chevron
`Pressable`. Save/Delete on form screens also call `router.back()` after a
successful write. **No screen anywhere in the codebase uses
`router.dismiss()`, `router.dismissAll()`, or `router.dismissTo()`** — those
expo-router APIs are entirely unused.

Two deliberate exceptions:

1. **`add-split.tsx`**: on save, `router.replace({ pathname: '/split-detail', ... })`
   instead of `router.back()` — see §4.9.
2. **`add-recurring.tsx`**: the form-mode close handler conditionally calls
   `router.back()` only `if (params.id)` — see §4.8.

`db-diagnostics.tsx` and `accounts.tsx` use a back-chevron icon instead of
the default ✕ on their `ModalHeader`, even though both are declared
`presentation: 'modal'` — a minor visual inconsistency, though the
underlying call is still `router.back()` either way.

---

## 10. Error and recovery flows

**Write failures** (any `useFinance()` action): `FinanceProvider`'s
`withDb()` wrapper catches the error, sets `persistError` to its message
(or a generic fallback), and rethrows so the calling screen's own local
handling can also react. `persistError` being non-null drives
`<PersistErrorBanner>`:
- Renders on **every screen** (mounted once in `RootNavigator`), red-bordered,
  near the top safe area, **no auto-dismiss** — it stays until a write
  succeeds.
- Tap → `/settings`, framed as the one action that actually rescues the
  data (export a backup off-device while the underlying issue persists).
- Clears automatically the next time any `withDb`-wrapped write succeeds —
  no manual dismiss control exists.

**Initial data-load failure** (§2 step 7): `persistError` is set the same
way, but `isLoaded` is still forced `true` so the app never hangs on the
splash. Worst case: an empty app with the export-backup banner permanently
up until a write finally succeeds or the user exports/inspects via Settings.
Recoverable without reinstalling in all observed cases.

**Blob migration failure** (§3): the legacy blob's raw bytes are quarantined
under a `_quarantine` key, never deleted — data loss doesn't occur. But
`migrationFailed` (computed in `FinanceProvider`) **is not consumed by any
UI component in the shipped app** — no banner, no Settings row. The only
place migration status is visible at all is `db-diagnostics.tsx` (§4.12),
which has no reachable entry point. **Net effect: a user whose legacy data
failed to migrate gets no in-app signal of that fact.** The bytes are safe,
but there is currently no discoverable in-app path to learn migration
failed, short of an engineer manually deep-linking to `db-diagnostics`.

**Bulk-operation failures** (Export / Import / Reset / Fill-test-data, all
driven through `db/operation-status.ts`'s shared `startOperation`/
`updateOperation`/`finishOperation`/`isCancelled` store): each is
try/caught in its calling screen and on failure calls
`finishOperation(id, { ok: false, message })` plus a local `Alert.alert`.
`<BackgroundOperationBanner>` reflects the shared state live from anywhere
in the app (progress, cancel button when cancellable), and separately fires
a system notification via `notifyOperationComplete` **only if the app is
backgrounded when the operation finishes** (a foregrounded completion is
already visible via the banner, so no duplicate notification). Import's
merge/replace `Alert` explicitly handles Android's back-gesture dismissing
it without a button firing (`onDismiss`), so the operation can't get stuck
"active" forever from that path.

**Summary**: every failure path is designed to be non-destructive and
recoverable without reinstalling. The one real discoverability gap is the
migration-failure / DB-health signal, which is computed correctly but
locked behind the orphaned `db-diagnostics` route and the unread
`migrationFailed` flag — see `AI_CONTEXT.md`'s known-issues section for the
consolidated list this feeds into.
