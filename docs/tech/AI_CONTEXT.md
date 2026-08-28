# AI Context — Rules, Conventions, and Known Issues

Layer 1 (Technical Bible), final document. This is the file an AI agent or
new maintainer should read before touching code — it consolidates the hard
invariants from `ARCHITECTURE.md`, the routing/component conventions from
`APP_FLOW.md`/`UI_BLUEPRINT.md`, and the concrete bugs found while writing
`FEATURES.md`, into one maintenance-protocol reference. It does not
re-explain what the app is; it explains how to change it without breaking
something that isn't visible from the diff.

All file:line references are accurate as of commit `89a0e9b` on `main`.

---

## 1. Non-negotiable invariants

These are load-bearing. Breaking one doesn't fail loudly — it silently
degrades correctness or performance at scale, often invisibly at
development-data sizes (tens of rows) and only surfacing at real-user
scale (thousands to millions of rows). Treat every one of these as a
design constraint, not a suggestion.

1. **Never scan the ledger to compute an aggregate.** Any balance, total,
   count, or chart value must come from `rollup`, `account_balance`, or
   `ledger_stat` — the three pre-aggregated tables — not a `SUM`/`COUNT`
   over `transactions`. The one deliberate, documented exception is
   subcategory-level aggregation (`FEATURES.md` §4), which is explicitly
   out of scope for the rollup's key shape and falls back to a bounded
   indexed scan by design, not oversight.
2. **Never diff — reverse the old contribution in full, then apply the
   new.** Any code that mutates a transaction's amount, type, account,
   category, or date must reverse its prior rollup/balance/stat
   contribution before applying the new one. `db/apply.ts` is the **only**
   sanctioned writer to `rollup`/`account_balance`/`ledger_stat` — its own
   header comment says so explicitly. Any other file that writes to those
   three tables directly is a bug, not an optimization. `db/bank-import.ts`
   is the standing cautionary example: it hand-rolled its own `rollup`
   SQL instead of routing through `applyRow`, used column names that don't
   exist in the schema (`expenses`/`count` instead of `expense`/
   `expense_count`), and never touched `account_balance`/`ledger_stat` at
   all — every bank-imported transaction silently has zero effect on any
   balance or chart, and the failure is swallowed by a per-row `catch`
   inside the enclosing transaction, so the `transactions` insert commits
   anyway (`FEATURES.md` §5). If you are about to write SQL against
   `rollup`/`account_balance`/`ledger_stat` anywhere outside `db/apply.ts`
   or `db/rebuild.ts`, stop — call `applyRow`/`reverseRow` instead, or add
   the case to `db/apply.ts` if it doesn't yet exist.
3. **Keyset pagination, never `OFFSET`.** Any paginated query over
   `transactions` must use `(date_ms, seq)` cursor comparison, matching
   `pageTransactions`'s pattern. `OFFSET`-based pagination degrades
   linearly with offset depth and defeats the whole point of the rollup
   architecture at scale.
4. **Pure/IO split for anything that needs to run under `tsx scripts/test-*.ts`.**
   Modules under `db/*.ts` and `utils/*.ts` that contain business logic
   (date math, validation, formatting, parsing) should avoid importing
   `react-native`/`expo-*` so they can be exercised directly with plain
   Node via `node:sqlite`. File-I/O, native-module, or React-tree-dependent
   code goes in a sibling `*-io.ts` file (see `utils/data-transfer.ts` vs
   `utils/data-transfer-io.ts`, or `utils/widget-data.ts` vs
   `utils/widget-data-io.ts`). If you add a new pure module, add a
   corresponding `scripts/test-*.ts` and wire it into `package.json`'s
   `test` script — every existing pure module has one.
5. **The `Db` interface is the only way to talk to SQLite.** Never import
   `expo-sqlite` directly outside `db/client.ts`. All query/mutation code
   goes through the `Db` interface (`db/types.ts`) so the same SQL can run
   against both `expo-sqlite` on-device and `node:sqlite` in tests.
6. **The data-version counter is deliberately coarse.** `db/version.ts`'s
   single global counter (not per-table) is a known, accepted tradeoff —
   do not "fix" it into a fine-grained invalidation scheme without first
   profiling a real perceived-lag report. It has already been investigated
   once as a root cause and left alone by design; re-litigating it without
   new profiling data repeats already-done work.
7. **Foreground-only processing stays foreground-only.** `processDueRules`
   (recurring rules) and the widget cross-context data-version re-sync
   both rely on the `AppState` listener firing on transition to
   `'active'` — there is no background task runner in this app (no
   `expo-background-fetch`, no headless cron). Don't assume recurring
   rules or widget writes are reconciled continuously; they're reconciled
   at the next foreground event, and only for one elapsed period at a time
   (see the missed-periods gap in `FEATURES.md` §2 before changing this
   code — the current behavior is a real gap, but "fix" it deliberately,
   with an explicit multi-period catch-up loop, not by accident).

---

## 2. Routing conventions

- Every screen that presents itself as a modal (uses `ModalHeader` +
  full-bleed `GradientScreen`) should have an explicit `<Stack.Screen
  name="..." options={{presentation:'modal'}}>` entry in `app/_layout.tsx`.
  Five screens currently don't (`manage-subcategories`, `add-recurring`,
  `add-split`, `split-detail`, `bank-import` — `APP_FLOW.md` §5) and
  animate as a push instead of a modal sheet, despite being authored as
  modals. When adding a new modal-style screen, add its `<Stack.Screen>`
  entry at the same time you create the file — don't let this list grow.
- Dismissal is `router.back()`, universally, except the two documented
  exceptions in `APP_FLOW.md` §9 (`add-split`'s post-save `router.replace`,
  `add-recurring`'s conditional close). `router.dismiss()`/`dismissAll()`/
  `dismissTo()` are unused in this codebase — don't introduce them without
  a reason that doesn't already have a `router.back()` solution.
- A screen's params should always be typed via `useLocalSearchParams<{...}>()`
  and every declared param should actually be read. `add-transaction.tsx`
  currently declares `fromScan`/`imageUri` in its param type but never
  reads them — this is the mechanism behind the dead share-intent-to-OCR
  path (`APP_FLOW.md` §6). If you add a param to a screen's type, wire up
  the code that consumes it in the same change, or don't add it.
- Any screen with async work should get a loading treatment consistent
  with its siblings. Home currently has none while its three sibling tabs
  all use `useScreenReady` + a skeleton — don't add a fourth divergent
  pattern; either match the existing skeleton convention or fix Home to
  match the other three.

---

## 3. UI/styling conventions

- **Design tokens live in `constants/theme.ts` and `constants/motion.ts` —
  import from there, never hardcode a hex color, font-family string, or
  spacing/radius number that already has a token.** The known leaks
  (`UI_BLUEPRINT.md` §9, items 1, 5, 9, 11, 13) are debt, not precedent —
  don't add more of them. In particular: `Fonts.body` has no `extraBold`
  entry, and `Manrope_800ExtraBold` is not loaded by `useFonts()` in
  `app/_layout.tsx` — don't reference that weight anywhere until it's
  either added to the font-loading call or the token set is extended to
  match what's actually loaded.
- **`AppText` is the only text primitive.** Use its 13 variants; don't
  reach for inline `style={{fontWeight, fontSize}}` overrides the way
  `recurring-insights.tsx`/`split-insights.tsx`/`repeat-sheet.tsx`
  currently do. If a variant doesn't exist for what you need, add one to
  `app-text.tsx` rather than overriding inline — that keeps the token
  system as the single source of truth for typography.
- **`GlassCard` is the card primitive**; the app draws a real, if
  undocumented-until-now, distinction between translucent "glass" surfaces
  (cards, hero, buttons, badges) and opaque white "hard" surfaces (modals,
  bottom sheets, the tab bar, overlay banners). Match whichever tier the
  new UI belongs to — don't invent a third treatment.
- **Entrances use `hooks/use-mount-pop.ts`, not Reanimated's `entering=`
  prop.** This is not stylistic preference — `entering=` has a
  reproducible react-native-web bug (a transform inside
  `withInitialValues()` causes `ScrollView` to measure content height from
  a stale mid-animation frame, compressing later rows). The only live
  `entering=` usage in the app is in dead code
  (`components/finance/trend-bar-chart.tsx`, unused anywhere). If you're
  tempted to use `entering=` for a new list/card animation, use
  `useMountPop`/`GlassCard`'s `animateIndex` instead.
- **Continuous/ambient animation loops require a `useReducedMotion()` (or
  `AccessibilityInfo.isReduceMotionEnabled()`) gate**, and ideally a
  `useFocusEffect` pause when off-screen. The two sanctioned exceptions
  (`GradientScreen`'s `AmbientOrbs`, `OrganicHero`'s buoyancy/morph clocks)
  both follow this; `TopographicField` used to be a third and was
  deliberately de-animated after being identified as a jank source (~50
  concurrent loops across mounted tab screens) — that's the standing
  cautionary tale for adding a new ambient loop without profiling its
  multiplied cost across every screen it could be mounted on
  simultaneously.
- **Errors need a consistent surface.** The one styled error component is
  `PersistErrorBanner`, reserved for write failures via `FinanceContext`'s
  `withDb` wrapper. Everything else in the app currently falls back to
  native `Alert.alert` (scan failure, save failure, delete confirmation) —
  visually inconsistent with the rest of the design system, and Reports'
  recurring/split insight fetch swallows errors into an empty `catch {}`
  entirely, indistinguishable from a legitimate empty state
  (`UI_BLUEPRINT.md` §5). Don't add a fourth error-handling style; either
  match `Alert.alert` for a transient, dismissible failure, or promote it
  through `persistError` if it represents a real data-integrity risk. Never
  swallow an error silently — if you write a `catch {}`, you are choosing
  to make a real failure indistinguishable from "no data," which is what
  happened in Reports.

---

## 4. Data-layer conventions

- **Adding a new entity type**: add a migration in `db/schema.ts` (bump
  the schema version, write the `CREATE TABLE`/`ALTER TABLE`), add a
  row↔domain mapping function (the `rowToX` pattern used throughout
  `db/recurring.ts`, `db/subcategories.ts`, etc.), add CRUD functions in a
  new `db/<entity>.ts` file, and if the entity contributes to any
  balance/total/chart, route its writes through `db/apply.ts` — never
  write ad-hoc SQL against `rollup`/`account_balance`/`ledger_stat`.
- **Adding a bulk-import path**: follow the existing bulk-load technique
  (drop the transaction table's secondary indexes, batch-insert, periodic
  WAL checkpoint, rebuild indexes + `rebuildRollups` once at the end) — do
  not write a new one-off aggregate-maintenance path the way
  `db/bank-import.ts` did. If in doubt, call `rebuildRollups(db)` at the
  end of any bulk operation rather than trying to incrementally maintain
  aggregates row-by-row during the import; it's the safe default and
  matches what every batch-load path *should* do even if some don't yet.
- **Testing**: every pure module has a `scripts/test-*.ts` counterpart run
  via `tsx`, wired into `package.json`'s `test` script. Run the full suite
  (`npm test`) before considering any `db/`/`utils/` change complete — it
  exercises schema migrations, rollup math, query correctness, CSV/JSON
  streaming, and seed-scale behavior without needing a device or emulator.

---

## 5. Consolidated known issues

Every item below was found by direct code reading while writing this
documentation set (not inferred, not assumed) — each is cited with the
exact mechanism in its source document. Treat this as the current defect
backlog implied by ground truth, not a wishlist.

### Correctness bugs

| # | Issue | Where | Detail |
|---|---|---|---|
| 1 | Bank-statement import silently fails on every row | `db/bank-import.ts` | Rollup writes reference non-existent columns (`expenses`/`count`); the transaction insert still commits, `imported` stays 0, the error is swallowed twice (once in the per-row catch, once in the UI dropping `result.errors`). See `FEATURES.md` §5. |
| 2 | Inline-split "You" leak | `db/splits.ts` + `components/finance/split-sheet.tsx` + `app/add-transaction.tsx` | `insertSplitParticipantsBatch`'s spread-then-override discards caller-supplied `paidAmount`/`status`, so a split created via the inline Add-Transaction flow inserts a permanently-`pending` phantom row for the payer. See `FEATURES.md` §3. |
| 3 | Share-intent-to-OCR path is dead | `hooks/use-shared-receipt.ts` + `app/add-transaction.tsx` | The hook pushes `?imageUri=`, but `add-transaction.tsx` declares the param and never reads it — sharing a screenshot into the app opens a blank form, silently discarding the image. See `APP_FLOW.md` §6. |
| 4 | Manual recurring rules don't create a pending transaction as documented | `db/recurring.ts` | The type comment promises a confirmable pending transaction; the implementation only fires a notification with no deep link and advances `next_due` regardless of user action — a missed reminder is unrecoverable. See `FEATURES.md` §2. |
| 5 | Recurring rules don't catch up on missed periods | `db/recurring.ts` | `processDueRules` handles at most one occurrence per rule per foreground event; multiple missed periods (e.g. the app closed for months) are silently skipped past, not created or reminded. See `FEATURES.md` §2. |
| 6 | Split overpayment is silently clamped | `db/splits.ts` (`recordRepayment`) | Paying more than a participant's remaining share caps `paid_amount` at the share, but the full amount is still deposited as account income — the two ledgers can diverge with no warning. See `FEATURES.md` §3. |

### Discoverability gaps

| # | Issue | Where | Detail |
|---|---|---|---|
| 7 | Blob-migration failure has no user-facing signal | `context/finance-context.tsx` + `app/db-diagnostics.tsx` | `migrationFailed` is computed but read by no UI component; the only screen that surfaces migration/DB health status is `db-diagnostics`, which has zero reachable entry points in the shipped app. See `APP_FLOW.md` §1, §4.12, §10. |
| 8 | `db-diagnostics` screen is fully orphaned | `app/db-diagnostics.tsx` | Declared in the root Stack, reachable only via a manually-typed deep link — no button/link anywhere in the app points to it. See `APP_FLOW.md` §4.12. |

### Consistency debt (not correctness bugs, but real divergences worth knowing before extending the affected code)

| # | Issue | Where |
|---|---|---|
| 9 | 5 modal-style screens lack explicit `presentation: 'modal'` declarations, animating as a push instead | `app/_layout.tsx` vs `manage-subcategories`, `add-recurring`, `add-split`, `split-detail`, `bank-import` |
| 10 | Two parallel donut-chart implementations; one set is dead code | `components/charts/category-donut.tsx` (live) vs `components/finance/donut-chart.tsx` (dead) |
| 11 | Dead Expo-template leftovers still in the tree | `icon-symbol*.tsx`, `external-link.tsx`, `haptic-tab.tsx` |
| 12 | App-wide theme context has zero real consumers | `context/theme-context.tsx` |
| 13 | `reorderSubcategories` has no UI caller | `db/subcategories.ts` |
| 14 | Two independent re-implementations of the same participant-management UI | `app/add-split.tsx` vs `components/finance/split-sheet.tsx` |
| 15 | Home has no loading skeleton, unlike its three sibling tabs | `app/(tabs)/index.tsx` |
| 16 | Two visual treatments of "an account" (row card vs. horizontal chip), not one shared component | `components/finance/account-card.tsx` vs `app/(tabs)/index.tsx` |
| 17 | `deleteAccount` silently cascades away any recurring rules tied to it, with no warning in the delete flow | `db/entities.ts` |

Before starting new feature work in any of the files listed above, read
the corresponding section of `APP_FLOW.md`, `UI_BLUEPRINT.md`, or
`FEATURES.md` for the full mechanism — this table is an index, not a
substitute for the detail.

---

## 6. Maintenance protocol for this documentation set

This two-tier documentation bible (`docs/tech/*` for AI agents/maintainers,
`docs/guides/*` for a zero-code plain-English audience) is a snapshot as of
commit `89a0e9b`. It will drift. When it does:

- A schema migration, a new route, a new reusable UI primitive, or a fix
  to any bug in §5 above should be reflected in the relevant `docs/tech/*`
  file in the same change, not deferred to a later documentation pass.
- If you fix one of the bugs in §5, update its row here (or remove it) and
  update the corresponding prose in `APP_FLOW.md`/`UI_BLUEPRINT.md`/
  `FEATURES.md` — don't leave a fixed bug documented as current.
- These documents describe what the code does, including its flaws. Don't
  edit them to describe an idealized target state; if a decision is made
  to leave a known issue unfixed for now, that's fine — just don't let the
  documentation start asserting behavior the code doesn't actually have.
