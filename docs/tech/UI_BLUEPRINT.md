# UI Blueprint

Layer 1 (Technical Bible) — code-level reference for AI agents and core
maintainers. Companion to `ARCHITECTURE.md` (tech stack, state, data layer)
and `APP_FLOW.md` (routing, navigation graph). This document covers: design
tokens, every reusable component's props/state/styling/animation, the
domain-component hierarchies, screen states (Default/Loading/Empty/Error)
per screen, responsive handling, and the styling/animation conventions
actually in force — including where components deviate from them.

All file:line references are accurate as of commit `89a0e9b` on `main`.
This document names real inconsistencies rather than describing an
idealized system — a `Known Inconsistencies` table closes it out.

---

## 1. Design tokens — `constants/theme.ts`

Single hardcoded light theme. **There is no dark mode**: no `Colors.dark`,
no `useColorScheme`, no `dark:` variant anywhere in the repo (confirmed —
zero matches). `AppThemeProvider`/`useAppTheme()` (`context/theme-context.tsx`)
exist and wrap the app, but have **zero real consumers** — every component
imports `Colors`/`Gradients`/`Spacing`/etc. directly from `constants/theme.ts`,
never through the context hook. It is unused indirection, not a live
theming mechanism.

### Colors (`theme.ts:9-49`)
| Group | Tokens |
|---|---|
| Base | `background #F3EDFB`, `textPrimary #191527`, `textSecondary #6B6480`, `textMuted #A29BB4`, `textInverse #FFFFFF` |
| Brand | `primary #8B5CF6`, `primarySoft #EFE6FD`, `primaryDeep #6D28D9`, `accent #F0A9D0` |
| Semantic | `income #2EA97C` / `incomeSoft rgba(46,169,124,.12)`, `expense #E05C7E` / `expenseSoft rgba(224,92,126,.12)` — deliberately muted, not alert-red/green |
| Glass surfaces | `glassBorder rgba(255,255,255,.72)`, `glassBorderSoft rgba(255,255,255,.42)`, `glassTint rgba(255,255,255,.5)` |
| Controls | `ctaBg #17131F`, `ctaText #FFFFFF`, `controlBg rgba(255,255,255,.55)`, `controlBgActive rgba(255,255,255,.95)`, `track rgba(25,21,39,.07)`, `divider rgba(25,21,39,.06)` |
| Navigation | `navIconActive #8B5CF6`, `navIconInactive #A79FBA` |
| Decorative | `contour rgba(139,92,246,.11)`, `contourWarm rgba(236,138,184,.10)` |

### Gradients (`theme.ts:51-67`)
| Token | Stops | Used by |
|---|---|---|
| `screen` | `['#EFE4FC','#F7E2EE','#FDF0E9','#EFF0F7']` at `[0,.34,.66,1]` | `GradientScreen` full-bleed wash |
| `glass` | `['rgba(255,255,255,.62)','rgba(255,255,255,.28)']` | `GlassCard` standard fill |
| `glassStrong` | `['rgba(255,255,255,.92)','rgba(255,244,250,.62)']` | `GlassCard strong` (hero cards) |
| `blob` | `['rgba(255,255,255,.96)','rgba(252,238,245,.78)']` | declared but **unused** — `OrganicHero` builds its own inline gradient stops instead |
| `progress` | `['#F5A8CE','#A78BFA']` pink→purple | `ProgressBar` |
| `cta` | `['#2A2138','#17131F']` | Primary buttons, FAB, selected date pill |

### Typography (`theme.ts:69-102`)
- Font families: **Sora** (`title`: `regular/semibold/bold/extraBold`) for headings/titles/buttons; **Manrope** (`body`: `regular/medium/semibold/bold`) for body/caption/labels/amounts.
- **`body` has no `extraBold` (800) token** — yet `amount-input.tsx` hardcodes the raw string `'Manrope_800ExtraBold'` for the amount display, and that weight is **never loaded** by `useFonts()` in `app/_layout.tsx` (only 400/500/600/700 Manrope weights are loaded). The amount-entry numeric text silently falls back to the OS default font. Real bug, not a design choice.
- `fontSizes`: xs 11, sm 13, md 15, lg 17, xl 20, 2xl 24, 3xl 28, 4xl 34, 5xl 42 — **`5xl` is defined but never consumed** anywhere.
- `letterSpacing`: tighter -1, tight -0.5, normal 0, wide 0.4.

### Spacing / radii / shadows (`theme.ts:104-157`)
- Spacing scale: xs 4, sm 8, md 12, lg 16, xl 24, 2xl 32, 3xl 48, 4xl 64.
- Border radii: xs 10, sm 16, md 22, lg 30, xl 38, pill 999.
- Shadows via a platform-branched `shadow()` factory: iOS gets real
  `shadowColor/Offset/Opacity/Radius`; Android's `elevation` is **capped at
  3 and forced to 0 unless the shadow color is exactly `#17131F`** (comment:
  Android's opaque elevation rect breaks glass translucency) — meaning
  `Shadows.soft`/`Shadows.lifted` render with **zero elevation on Android**.
  Presets: `none`, `soft` (y8 r24 op.07, elev 3), `lifted` (y18 r38 op.12,
  elev 8), `floating` (y12 r30 op.2, near-black, elev 12 — the only preset
  with real Android elevation, since its color matches `#17131F`).
- **No breakpoint tokens** exist in `theme.ts` — no `sm/md/lg` screen-size keys.

### Motion — `constants/motion.ts`

Stated philosophy (comment, `motion.ts:1-16`): "motion must be *caused*" —
explicitly bans ambient always-running loops as the historical top cause of
dropped frames; prefers transform/opacity animation over layout/SVG-path.

| Token | Values |
|---|---|
| `Duration` | `instant 110`, `quick 190`, `base 260`, `emphasis 420` (ms) |
| `Ease` | `out = Easing.out(cubic)`, `inOut = Easing.inOut(quad)`, `emphasis = Easing.bezier(.2,.9,.25,1.1)` (overshoot, reserved for high-value confirmations) |
| `Spring` | `press {22,340,.6}`, `settle {20,210,.8}`, `pop {14,260,.7}` (damping/stiffness/mass) |
| `PressScale` | `card .985`, `button .97`, `control .93` |
| Stagger | `STAGGER_STEP=45`, `STAGGER_MAX_ITEMS=6`, `staggerDelay(i) = min(i,6)*45` |

`motion.ts` also documents (comment, lines 80-88) why the app's one
entrance animation (`hooks/use-mount-pop.ts`) is hand-rolled instead of
Reanimated's `entering=` prop — see §7.

---

## 2. `components/ui/` — core primitives

### `gradient-screen.tsx` — `GradientScreen`
`{ children, contours?: 'none'|'top'|'full' (default 'none'), edges? (default ['top']), contentStyle? }`.
Renders: full-bleed `LinearGradient(Gradients.screen)` → `AmbientOrbs` → optional
`TopographicField` (if `contours !== 'none'`) → `SafeAreaView`. `AmbientOrbs`
are 3 slow-drifting radial blobs (`withRepeat(withSequence(withTiming))`,
10-14s cycles) — **skipped entirely if `AccessibilityInfo.isReduceMotionEnabled()`**.
This is the one deliberate exception to `motion.ts`'s "no ambient loops" rule.
Wraps content on every `app/(tabs)/*` screen and most modals.

### `glass-card.tsx` — `GlassCard` (the card primitive)
`{ children, style?, padding?, radius?, strong? (brighter hero fill), intensity? (blur, default 28), animateIndex? (stagger index), elevated? (Shadows.lifted vs .soft), animate? (default true) }`.
A `splitCardStyles()` helper routes padding/flex-layout keys from the passed
`style` into an inner content `View`, keeping border/radius/background/shadow
on the outer `Animated.View`. Default content padding `Spacing.xl` (24).
Render stack: outer `Animated.View` (1px border, `strong` fill toggles
opacity) → `BlurView intensity={intensity} tint="light"` **only on
non-Android** (Android never blurs `GlassCard`, relying on the gradient
fill alone for translucency) → `LinearGradient(glass|glassStrong)` → content
`View`. Animation: `useMountPop(animateIndex!==undefined ? staggerDelay(animateIndex) : 0, animate)`.
Exported as `React.memo(GlassCardBase)` — comment notes it's rendered once
per row in long lists, so prop identity matters.

### `organic-hero.tsx` — `OrganicHero` (the morphing blob hero)
`{ label?, value?, sub?, badges?: HeroBadge[], size? (default 225), currency?, numberFormat?, onPressMain?, children? }`.
`HeroBadge = { id, name, balance, currency, numberFormat, icon, slot: 'topLeft'|'topRight'|'bottomLeft'|'bottomRight', color?, label?, onPress? }`
— orbiting satellite bubbles (e.g. per-account mini balances).

Four hardcoded 38-number blob-outline coordinate arrays (`SHAPE_0..SHAPE_3`)
are pairwise-interpolated inside a `useAnimatedProps` worklet driving an SVG
`Path`'s `d`, unrolled by hand for zero per-frame allocation. Driven by a
`morphVal` shared value (`withRepeat(withTiming(4, {7000ms, linear}), -1)`).
A separate `timeVal` clock (`withRepeat(withTiming(2π, {4600ms, linear}), -1)`)
drives sinusoidal float/stretch/rotate on the blob container plus a
counter-rotating aura halo. **Both continuous loops start/stop in a
`useFocusEffect`** (paused when the screen loses focus) **and are skipped
entirely under `useReducedMotion()`**.

Press feedback: haptic + squash/stretch (`Spring.pop`) + an expanding SVG
ripple. Value-swap: whenever `label`/`value` change, a `swapAnim` sequence
(`withTiming(0,110ms)` then `withSpring(1,{14,180})`) pops the content.
`SmallFloatingBubble` (satellite badges) is individually `React.memo`'d,
has its own staggered merge-in, independent buoyant drift (per-index phase/
speed offsets), and its own pop-on-value-change.

### `app-button.tsx` — `AppButton`
`{ title, onPress, variant?: 'primary'|'glass'|'ghost'|'text' (default 'primary'), size?: 'sm'|'md'|'lg' (default 'lg'), icon?, disabled?, loading?, fullWidth? (default true), style?, textStyle? }`.
Size map: sm `{pv10, ph16, fs13}`, md `{pv14, ph24, fs14}`, lg `{pv18, ph32, fs15}`.
`primary` → `Colors.ctaBg` + `Shadows.floating` + `Gradients.cta` overlay;
`glass` → flat `Colors.controlBg` + border (**no `BlurView`** — despite the
name, the `glass` variant is not actually blurred); `ghost` → transparent +
border; `text` → transparent, minimal padding. Standard press-scale
(`PressScale.button`/`Spring.press`↔`Spring.settle`). `loading` swaps
content for a spinner; `disabled||loading` → `opacity: 0.4`.

### `app-text.tsx` — `AppText` (the only text primitive)
13 fixed variants: `display, h1, h2, h3, subtitle, body, bodyStrong, caption,
micro, label, button, link, amount` — each a fixed
`{fontFamily, fontSize, lineHeight, letterSpacing?, color}` pulled from
`Fonts`/`Typography`/`Colors`. `label` is the only uppercase variant
(`letterSpacing 0.9`). Pure presentational, no internal state.

### `modal-header.tsx` — `ModalHeader`
`{ title, subtitle?, onClose, onDelete?, rightAction?, closeIcon?: 'close'|'arrow-back' (default 'close') }`.
Close `IconButton` (42px) — centered title/subtitle — right slot priority:
delete (red trash icon) → `rightAction` → invisible 42px spacer for
symmetry. Used by essentially every full-screen modal in the app, declared
and undeclared alike (see `APP_FLOW.md` §5 for the declared/undeclared
split — `ModalHeader` itself doesn't know or care which).

### `icon-button.tsx` — `IconButton`
`{ iconName, onPress, size? (default 44), iconSize? (default round(size*.42)), color?, solid?, style? }`.
`solid` → dark filled (`Colors.ctaBg`, `Shadows.floating`, no border); default
→ `Colors.controlBg` + border + `BlurView intensity={24}` (again
non-Android only) + `Shadows.soft`. `PressScale.control` + `haptics.toggle()`.

### `background-operation-banner.tsx` — `BackgroundOperationBanner`
No props — reads `db/operation-status.ts` via `useSyncExternalStore`.
Root-mounted, `pointerEvents="box-none"`. Bottom position animates
(`withSpring`) between two targets depending on whether the active route
segment is `(tabs)` (avoids the floating tab bar, target = `64 + inset +
12`) or not (`inset + 12`). Explicitly **hidden** on a `HIDDEN_SCREENS` set:
`add-transaction, add-budget, add-account, add-split, add-recurring,
split-detail, fill-test-data, bank-import` (so it never covers a keypad or
submit button). Shows either an indeterminate spinner or a numeric percent
ring, label/detail text, optional `ProgressBar`, optional cancel button.
Fires an OS notification only if `AppState.currentState !== 'active'` when
the operation completes — a foregrounded completion relies on the banner's
own visible state. **Card is opaque `#FFFFFF`, not translucent** — visually
inconsistent with `GlassCard`'s blur/gradient treatment.

### `persist-error-banner.tsx` — `PersistErrorBanner`
No props — reads `persistError` from `useFinance()`; renders `null` if
unset. **No auto-dismiss** — stays until a write succeeds (comment: a
failed disk write means in-memory state is ahead of disk; this used to be
a silent `console.warn`). Tap → `/settings`. Pale-red (`#FFF1F2`) card,
`Colors.expense` border — the app's **one explicit error-styled surface**,
visually distinct from every glass-tinted card. Root-mounted, above
`BackgroundOperationBanner`.

### `app-splash.tsx` — `AppSplash`
`{ isReady, onAnimationComplete? }`. Fades opacity 1→0 over
`Duration.emphasis` (420ms) once `isReady` flips true, then calls back via
`runOnJS`; `pointerEvents` flips to `'none'` once ready so it doesn't block
touches mid-fade. Renders the app icon (140×140) + version string. **Hardcodes
background `'#ffffff'`** (not `Colors.background`) and
`fontFamily:'Manrope_600SemiBold'` (not `Fonts.body.semibold`) — a plain
white splash distinct from the app's lavender gradient elsewhere, and a
raw-string duplicate of a theme token. Used exactly once, in
`app/_layout.tsx`, driven by `FinanceProvider`'s `state.isLoaded`.

### `skeleton.tsx` — `Skeleton`
`{ width? (default '100%'), height? (default 16), radius? (default BorderRadius.sm), style? }`.
Two independent loops: a translating shimmer sweep and a pulsing base-layer
opacity — both frozen/skipped under reduced motion. Sole low-level skeleton
primitive; screen-level skeletons (`BudgetsSkeleton`, `TransactionsSkeleton`,
`ReportsSkeleton`) compose it inside `GlassCard`s (`animate={false}`) to
mock the real layout shape.

### `topographic-field.tsx` — `TopographicField`
`{ style?, warm? }`. `React.memo`'d, **fully static** (4 radial-gradient
orbs) — a comment documents this was deliberately **de-animated**: it used
to run 3 loops × 4 orbs × up to 4 mounted tab screens (~50 concurrent
animations), "the app's single biggest source of jank." A useful
before/after data point: the team actively prunes ambient motion where it
costs more than it's worth, even while keeping it in `GradientScreen`'s
`AmbientOrbs`.

### Smaller primitives
- **`segmented-control.tsx`** — generic `SegmentedControl<T>`, white pill on
  a track, used for type toggles (Expense/Income/Transfer,
  Spending/Recurring/Shared).
- **`month-stepper.tsx`** — `‹ MMMM YYYY ›`, pill chrome, Budgets-only.
- **`page-indicator.tsx`** — dot pager for onboarding; unusually calls
  `withSpring` directly inside a `useAnimatedStyle` worklet rather than from
  a `useEffect`, unlike every other animated component in the app.

### Dead code in `components/ui/`
`icon-symbol.tsx`/`icon-symbol.ios.tsx` (leftover Expo-template SF-Symbol↔
MaterialIcons mapping) and `components/external-link.tsx` are never
imported anywhere outside their own definition files — confirmed via
repo-wide grep. Not part of the live design system.

---

## 3. Navigation components

### `components/navigation/floating-tab-bar.tsx` — `FloatingTabBar`
Custom `tabBar` render-prop for `<Tabs>` (`BottomTabBarProps`). Routes split
`left`/`right` around a fixed center "+" `CenterAction` (not a route —
`router.push('/add-transaction')` directly, bypassing tab navigation).
64px-tall true pill (`BorderRadius.pill`), absolute-positioned,
`paddingBottom: insets.bottom || 12`. **Opaque `#FFFFFF`, no `BlurView`** —
despite the "glass" narrative elsewhere, this bar is a plain white rounded
rect, not translucent. Hand-rolled shadow spec (`shadowOpacity:.09,
shadowRadius:16, elevation:10`) distinct from any `Shadows.*` preset —
a third, ad-hoc shadow definition alongside `theme.ts`'s and the FAB's own.
`CenterAction`: 48px circle, `Gradients.cta` fill, its own separate
hand-rolled shadow. Active-tab detection is plain `state.index === index`;
tapping the already-active tab is a no-op (still fires
`haptics.selection()`, but does not call `navigation.navigate` — no
scroll-to-top/reset-to-root behavior, unlike default React Navigation tab
bars). Press feedback: `Spring.press`/`Spring.settle` scale on every tab
and the FAB.

### `components/navigation/tab-gradient-icon.tsx` — `TabGradientIcon`
`{ name: 'home'|'activity'|'budgets'|'reports', focused, size? (default 24) }`.
4 hand-drawn `react-native-svg` paths, 24×24 viewBox. Focused state applies
a purple→pink (`#8B5CF6`→`#EC4899`) linear-gradient stroke plus a slightly
heavier stroke width; unfocused uses a flat hardcoded `#A79FBA` (duplicates
`Colors.navIconInactive` as a raw string rather than importing it). No
animation lives in this file — press/scale motion is owned by
`FloatingTabBar`'s wrapper.

`components/haptic-tab.tsx` (`HapticTab`, an unused `PlatformPressable`-based
tab button) is **dead code** — `FloatingTabBar` fully replaced it; never
wired into any `Tabs.Screen`.

---

## 4. Domain components — `components/finance/`, `components/charts/`

### Transaction rows
`components/finance/transaction-list-item.tsx` (`TransactionListItem`,
`React.memo`'d) deliberately does **not** subscribe to `FinanceContext`
itself — callers pre-resolve `category`/`account`/`toAccount` — because a
naive per-row subscription caused "250+ re-renders on every state update"
(code comment). Handles transfer/income/expense icon/color/title/subtitle,
plus small recurring/split tag badges.

Day-grouping is built per-screen, not as a shared component: Activity's
`DayGroup` (`app/(tabs)/transactions.tsx`) = `AppText(day label) → GlassCard(animate=false) → TransactionListItem[]`.
`animate={false}` here specifically works around a reproducible Reanimated
web-layout-animation crash measuring rows inside a `FlatList` during
mount/recycle. Home's "Recent activity" section reuses the same
`GlassCard → TransactionListItem[]` shape but leaves `animate` at its
default `true` — safe there because Home uses a plain `ScrollView`, not a
`FlatList`. The asymmetry is intentional, documented in-code, not accidental.

### Budgets
`budget-row.tsx` (`BudgetRow`): `GlassCard → (icon badge + title/account
badge/spent-of-limit text + percent pill) + ProgressBar + remaining/over
text`. Reads `useFinance()` directly (unlike `TransactionListItem`) to
resolve the budget's target account.

`progress-bar.tsx` (`ProgressBar`): animated pill track,
`withTiming(pct*100, {780ms, Ease.out})` on prop change, `Gradients.progress`
fill by default, red ramp when `over`. Reused inside `CategoryDonut`'s
legend, `BackgroundOperationBanner`, and the Budgets summary card.

### Accounts
Two separate visual treatments exist for "an account," not one shared
component: `account-card.tsx` (`AccountCard`, vertical row, used on the
Accounts screen) and Home's own inline horizontal-scroll "account chip"
(hand-built `GlassCard`, not `AccountCard`). Different contexts, but worth
documenting as two hierarchies.

### Pickers
`category-picker.tsx` — horizontal icon-badge scroller, selected badge gets
a solid fill + purple glow, optional dashed "Manage" add-tile.
`account-picker.tsx` — same pattern with pill chips (icon + text) instead
of badges, selected = `Colors.ctaBg` dark fill.

### Recurring / Split insight views
`recurring-insights.tsx` (`RecurringInsightsView`) and `split-insights.tsx`
(`SplitInsightsView`) both follow a 3-card shape: empty-state card (own
bespoke layout, **not** the shared `EmptyState` component — a duplication),
hero summary `GlassCard(strong, elevated)`, then one or two list cards.
`SplitInsightsView` additionally has a *second*, different nested
"All caught up!" empty sub-state when splits exist but none are unsettled.
Both files lean heavily on **inline `style={{fontWeight, fontSize}}`**
overrides on `AppText` rather than variants or `StyleSheet` entries —
inconsistent with every other finance component (`BudgetRow`, `AccountCard`,
`TransactionListItem` never do this).

### Charts — two parallel systems, only one live

**Live, imported by `app/(tabs)/reports.tsx`** (`components/charts/`):
- `trend-area-chart.tsx` — single-series smoothed area chart, cubic-smoothed
  path, animated left-to-right reveal via an `Animated.View` width mask
  (not a per-frame path redraw). Only peak/latest/selected points get
  value markers.
- `category-donut.tsx` (`CategoryDonut`) — per-segment `AnimatedCircle` arcs
  driven by one shared `sweep` value (biggest segment draws in first),
  capped at 6 segments + folded "Other." Doubles as its own selectable
  legend.
- `weekday-bars.tsx` — 7-bucket bars, staggered reveal; only the peak day
  gets a value label + accent color (comment: a one-measure chart shouldn't
  double-encode height as hue).
- `calendar-heatmap.tsx` — GitHub-style contribution grid, 4-step purple
  ordinal ramp + neutral zero-activity cells, capped stagger reveal.

**Dead, unused anywhere in `app/`** (`components/finance/`):
- `donut-chart.tsx` (`DonutChart`) — a simpler, non-animated donut.
- `trend-bar-chart.tsx` (`TrendBarChart`) — grouped income/expense bars,
  notably the **only** chart in the app using Reanimated's `entering={FadeInDown...}`
  prop rather than the `useSharedValue`-driven reveal every live chart uses
  — consistent with it being an earlier, superseded iteration rather than
  a live counter-example to the documented `entering=` avoidance (§7).

Both dead files should be treated as removal candidates, not part of the
live UI.

### Other finance components (brief)
- `icon-badge.tsx` — the standard category/account mark: rounded-square,
  `${color}22` tinted background unless `solid`.
- `stat-card.tsx` — small fixed-height `GlassCard` KPI tile (Home's
  Income/Spent row).
- `empty-state.tsx` (`EmptyState`) — the shared empty-state primitive: icon
  circle (`Colors.primarySoft`) + title + optional subtitle/CTA. Used by
  Home, Activity, Budgets, and Reports' Spending view. **Not** reused by
  Reports' Recurring/Shared views (those hand-duplicate the pattern — see
  above). No illustration SVGs are ever used here — always a single
  `Ionicons` glyph; hand-drawn illustration is reserved for onboarding.
- `amount-input.tsx` — exports `AmountDisplay`, `Numpad`, `AmountInput`.
  Keys use press-scale + a background-tint animation. Hardcodes
  `'Manrope_700Bold'`/`'Manrope_800ExtraBold'` (the latter never loaded —
  see §1).
- `scan-receipt-button.tsx` — receipt-scan entry point, its own inline
  gradient card (not `Gradients.glass`), spinner + "Reading screenshot…"
  while scanning.
- `date-picker-modal.tsx`, `repeat-sheet.tsx`, `split-sheet.tsx` — native
  `Modal`-based calendar/bottom sheets, **opaque white** bodies (not
  glass), keyboard-aware via `useKeyboardBottomInset`. The two sheets share
  the same inline-`fontWeight`-override pattern as `recurring-insights.tsx`.
- `insight-filters.tsx` — chip-based filter bar for Reports; its
  expandable panel is one of only two places in the app using Reanimated's
  `exiting={FadeOut...}` prop.
- `onboarding-glyph.tsx` — the 3 hand-drawn onboarding illustrations
  (wallet, shield/lock, trend line).

---

## 5. Screen states

### Loading

| Screen | Mechanism |
|---|---|
| App-level (all screens) | `<Stack>` doesn't mount until `state.isLoaded`; `AppSplash` (white, animated fade) covers the gap — see `APP_FLOW.md` §1. |
| Home | **No skeleton, no `useScreenReady` gate at all** — renders immediately from hooks with baked-in empty-state defaults. Inconsistent with the other three tabs. |
| Activity | `useScreenReady(180)` gate (defers heavy content until `InteractionManager.runAfterInteractions()` + 180ms, to keep tab-switch transitions smooth) → `<TransactionsSkeleton/>` while not ready or first page loading. |
| Budgets | Same `useScreenReady` gate → `<BudgetsSkeleton/>`. |
| Reports | Same gate → `<ReportsSkeleton/>`, **plus two more layered loading treatments**: an inline `ActivityIndicator + "Updating…"` row during filter refetches, and the populated content dims to `opacity: 0.5` while `loading` — three distinct loading treatments on one screen, more elaborate than any other. |
| Add-transaction (edit mode) | **No loading UI at all** for the `getTransactionById` fetch — fields populate silently once it resolves. |

### Empty

All four tabs (and Reports' Spending sub-view) use the shared
`EmptyState` component, each wrapped in a `GlassCard`:

| Screen | Icon | Copy pattern | CTA |
|---|---|---|---|
| Home (recent activity) | `receipt-outline` | "Nothing here yet" | none |
| Activity | `search-outline` | "No matches" (subtitle varies by active search) | none |
| Budgets | `pie-chart-outline` | "No budgets yet" | "Create a budget" → `/add-budget` |
| Reports · Spending | `analytics-outline` | dynamic `"No {currency} data in this range"` | none |
| Reports · Recurring | — | **bespoke inline block, not `EmptyState`** | "+ Add New" → `/add-recurring` |
| Reports · Shared | — | **bespoke inline block, not `EmptyState`**, plus a second "All caught up!" sub-state (no card) when splits exist but none are unsettled | "+ Split New" → `/add-split` |

### Error

- The **only** styled, dedicated error surface in the app is
  `PersistErrorBanner` (pale-red card, persistent, no auto-dismiss) — for
  failed writes anywhere in `FinanceContext`.
- Every other error is a native `Alert.alert` — scan failure, save failure,
  delete confirmation on `add-transaction.tsx` — visually outside the
  glass-gradient design language entirely (system font/colors).
- Reports' recurring/split insight fetch has an **empty `catch {}`** — a
  fetch failure leaves the data `null`, which renders identically to the
  legitimate empty state. **A DB/fetch error here is visually
  indistinguishable from "you have no recurring rules yet."**

### Default / Active (populated)

- **Home**: pinned feathered-gradient header → scroll-reactive `OrganicHero`
  (fades/scales/translates with `scrollY`) → optional account-filter chip →
  Income/Spent `StatCard` row → horizontal account chips + add-account tile →
  Recent-activity `GlassCard` list.
- **Activity**: header + search pill + horizontal filter chips
  (All/Spending/Income/Transfers) + keyset-paginated `FlatList` of `DayGroup`s.
- **Budgets**: header + solid add `IconButton` + `MonthStepper` + optional
  multi-currency chips + summary `GlassCard(strong, elevated)` + `BudgetRow[]`.
- **Reports**: header + 3-way segmented control (Spending/Recurring/Shared)
  → (Spending) Expense/Income toggle + currency chips + `InsightFilters` +
  hero stat card + `TrendAreaChart` + `CategoryDonut` + `CalendarHeatmap` +
  `WeekdayBars`.
- **Add-transaction**: `ModalHeader` → optional "Scanned" confirmation
  banner → type segmented control → amount `GlassCard(strong, elevated)`
  wrapping `AmountDisplay` → account/category pickers → note/payee fields →
  repeat/split sheet triggers.

---

## 6. Responsive / breakpoint handling

**None exists in the screen/component layer.** Zero matches anywhere in
the repo for `useWindowDimensions`, `isTablet`, or any screen-size
branching. The only `Dimensions` usage in `app/`/`components/` is a single
static, non-reactive read in `topographic-field.tsx` (positions one
decorative orb at `SCREEN_HEIGHT * 0.3`, read once, no listener).

`widgets/widget-format.ts` **does** define real size-class breakpoints
(`quickLogSizeClass`, `resolveWidgetSize`, `accountRowCapacity`), but these
target **Android home-screen widgets** (RemoteViews), a completely separate
rendering surface from the app's own screens — not part of this blueprint's
subject matter, and not evidence of app-level responsive design.

**Conclusion**: all spacing/sizing in the app UI is fixed-pixel from
`constants/theme.ts`'s `Spacing`/`BorderRadius` scales, uniformly across
phone screen sizes. There is no tablet layout and no density-based
adaptation.

---

## 7. Styling and animation conventions

### Styling
- Dominant pattern: `StyleSheet.create({...})` per file, tokens imported
  directly from `constants/theme.ts`.
- **Two-tier surface system** (not written down anywhere else, made
  explicit here): cards/hero/buttons/badges are consistently translucent
  "glass" surfaces (`GlassCard`, `IconButton`, `OrganicHero`); modals,
  bottom sheets, the tab bar, and overlay banners are consistently
  **opaque white "hard" surfaces** (`FloatingTabBar`, `DatePickerModal`,
  `RepeatSheet`, `SplitSheet`, `AppSplash`, `BackgroundOperationBanner`).
  This reads as an intentional glass-for-in-flow-content /
  solid-for-chrome-and-overlays split, though several of the opaque
  surfaces hardcode `'#FFFFFF'` as a raw string rather than a token.
- Hardcoded-hex leaks bypassing the token system: `floating-tab-bar.tsx`
  bar background, `tab-gradient-icon.tsx` inactive color (duplicates
  `Colors.navIconInactive`), `date-picker-modal.tsx`/`repeat-sheet.tsx`
  sheet backgrounds, `app-splash.tsx` background, `background-operation-banner.tsx`
  background.
- Font-family hardcoded-string leaks bypassing `Fonts`: `amount-input.tsx`
  (`'Manrope_700Bold'`, `'Manrope_800ExtraBold'`), `app-splash.tsx`
  (`'Manrope_600SemiBold'`), the Activity search input
  (`'Manrope_500Medium'`).
- Inline `style={{fontWeight, fontSize, ...}}` overuse, bypassing both
  `StyleSheet.create` and `AppText` variants: concentrated in
  `recurring-insights.tsx`, `split-insights.tsx`, `repeat-sheet.tsx`.

### Animation — three deliberate idioms, plus one bounded exception

1. **Entrance** — `hooks/use-mount-pop.ts`, the app's one signature pop:
   hand-rolled opacity/scale(.92→1)/translateY(10→0) via `useSharedValue`+
   `useAnimatedStyle`, `Duration.base+90`, `Ease.emphasis`, optional
   `staggerDelay(index)`. **Deliberately not** Reanimated's `entering=` —
   documented reason (code comment): a reproducible react-native-web bug
   where a transform inside `entering`'s `withInitialValues()` causes a
   `ScrollView` to measure content height from a stale mid-animation frame,
   compressing later rows into an overlapping stack. Used by `GlassCard`,
   `OrganicHero`, `InsightFilters`, `PersistErrorBanner`,
   `BackgroundOperationBanner`. The one live exception is the **dead**
   `components/finance/trend-bar-chart.tsx`, which does use `entering=` —
   harmless since nothing renders it.
2. **Press feedback** — universal `scale` shared value +
   `withSpring(PressScale.<card|button|control>, Spring.press)` on
   press-in, `withSpring(1, Spring.settle)` on press-out, usually paired
   with a `haptics.*()` call. Identical pattern in `AppButton`,
   `IconButton`, `FloatingTabBar`'s items, `ScanReceiptButton`,
   `AmountInput`'s keys, `OrganicHero`'s badges (`Spring.pop` variant).
3. **Value-change / data-driven reveal** — a `useEffect` resets a shared
   value on dependency change and re-tweens: `ProgressBar`, `CategoryDonut`'s
   sweep, `TrendAreaChart`'s wipe mask, `WeekdayBars`/`CalendarHeatmap`'s
   staggered reveal, `OrganicHero`'s value-swap pop.
4. **Continuous/ambient loops** — the bounded exception to the "no ambient
   loops" rule: `GradientScreen`'s `AmbientOrbs` and `OrganicHero`'s
   buoyancy/morph clocks, both gated behind `useReducedMotion()` (and, for
   `OrganicHero`, also `useFocusEffect` so the loops stop off-screen).
   `TopographicField` used to be in this category and was explicitly
   **de-animated** for performance — a documented before/after data point.

There is no `useFrameCallback` usage anywhere in the repo — the blob morph
is driven entirely by `useAnimatedProps` + `withRepeat(withTiming(...))`
worklets, not a per-frame callback hook.

---

## 8. Icon system

- **`@expo/vector-icons` (`Ionicons`)** — the default system for every
  functional/semantic glyph: buttons, badges, headers, pickers, empty
  states, list decorations, sheet chrome.
- **`react-native-svg` custom paths** — reserved for decorative/illustrative
  and brand-identity graphics only, never simple functional icons:
  `TabGradientIcon`'s 4 nav paths, `OrganicHero`'s entire blob/aura/ripple
  system, `TopographicField`'s background orbs, `OnboardingGlyph`'s 3
  illustrations, and all of `components/charts/` (plus the dead
  `donut-chart.tsx`/`trend-bar-chart.tsx`) — every chart is raw SVG
  primitives, no chart library.
- No third icon system exists. `IconSymbol`/`icon-symbol.ios.tsx` (SF
  Symbols↔MaterialIcons scaffold from the Expo template) is present but
  unused anywhere in the app.

---

## 9. Known inconsistencies (ground truth, not idealized)

| # | Inconsistency | Where |
|---|---|---|
| 1 | Tab bar is opaque white, not blurred/translucent, despite the "glass" narrative | `floating-tab-bar.tsx` |
| 2 | Two parallel donut-chart implementations and two chart-reveal idioms; one set is dead code | `components/finance/donut-chart.tsx`, `trend-bar-chart.tsx` |
| 3 | Dead Expo-template leftovers, unused anywhere | `icon-symbol*.tsx`, `external-link.tsx`, `haptic-tab.tsx` |
| 4 | App-wide theme context provided but has zero consumers; all components import tokens directly | `context/theme-context.tsx` |
| 5 | `Manrope_800ExtraBold` hardcoded but never loaded by `useFonts()` — silent font fallback on the amount display | `amount-input.tsx` vs `app/_layout.tsx` |
| 6 | Local/transient errors use unstyled native `Alert.alert`, sharply inconsistent with the one styled error surface | `add-transaction.tsx` vs `persist-error-banner.tsx` |
| 7 | Recurring/Split insight fetch swallows errors silently; a fetch failure renders identically to "no data yet" | `app/(tabs)/reports.tsx` |
| 8 | Home has no loading skeleton / no `useScreenReady` gate, unlike the other 3 tabs | `app/(tabs)/index.tsx` |
| 9 | Heavy inline `style={{fontWeight, fontSize}}` overrides bypass the `AppText` variant system | `recurring-insights.tsx`, `split-insights.tsx`, `repeat-sheet.tsx` |
| 10 | Recurring/Splits empty states hand-duplicate rather than reuse the shared `EmptyState` component | `recurring-insights.tsx`, `split-insights.tsx` |
| 11 | Tab bar and its FAB each define ad-hoc shadow specs instead of drawing from `Shadows.*` | `floating-tab-bar.tsx` |
| 12 | Android gets no card shadow (elevation forced to 0 for non-`#17131F` colors) and no `BlurView` on `GlassCard`/`IconButton` — "glass" is materially flatter on Android by explicit design, not a bug, but must be documented | `theme.ts`, `glass-card.tsx`, `icon-button.tsx` |
| 13 | `Gradients.blob` token defined but never consumed | `theme.ts` vs `organic-hero.tsx` |
| 14 | No responsive/tablet/breakpoint logic anywhere in the screen/component layer; the only size-class breakpoints target Android widgets, a separate surface | `widgets/widget-format.ts` |
| 15 | Two separate visual treatments of "an account" (`AccountCard` vs Home's inline chip), not one shared component | `account-card.tsx` vs `app/(tabs)/index.tsx` |
