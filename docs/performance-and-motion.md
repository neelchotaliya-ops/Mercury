# Performance and motion

The app was reported as laggy on a MediaTek 8500 Ultra with 8 GB RAM — decent
hardware — so the causes were measured rather than guessed at. This is what was
found and what changed.

## What was actually slow

| Cause | Measured cost |
| --- | --- |
| `TopographicField` ran 4 orbs x 3 infinite loops = **12 permanent animations per screen**, translating *and scaling* 380–420px radial-gradient SVGs. `GradientScreen` renders it on 12 screens, and tab screens stay mounted, so ~**48 concurrent loops** after visiting all four tabs. | Dominant cause |
| `organic-hero` rebuilt the blob's SVG `d` string inside a worklet **every frame**, forcing react-native-svg to re-parse and re-tessellate the path natively at 60fps — plus 5 more loops on the hero and 1 per floating badge. | Second largest |
| The Activity tab rendered **every** transaction in a plain `ScrollView`, one `GlassCard` per day-group, with an uncapped `index * 70ms` entrance stagger (a ~10-second cascade on seeded data). | Large |
| `FinanceContext`'s value object was rebuilt on every render, so every `useFinance()` consumer re-rendered on any state change. | Broad |
| `getTotalBalance` was O(accounts x transactions); sort comparators allocated two `Date` objects per comparison; `toMonthKey` allocated a `Date` per transaction per call. | Grows with ledger |

## What changed

**Selectors** (`utils/selectors.ts`) — balances for all accounts now come from a
single pass; sorting compares ISO strings directly (they are lexicographically
ordered, so parsing was pure waste); month/day keys are memoized per timestamp
in `utils/date.ts`.

Measured on the same machine, per call:

| | 250 txns | 2000 txns |
| --- | --- | --- |
| `getTotalBalance` | 1.6x faster | 2.2x faster |
| `getTransactionsForMonth` | 5.6x faster | **14.1x faster** |
| `groupTransactionsByDay` | 6.8x faster | 7.3x faster |

Those are V8 numbers on a desktop; on Hermes on a mid-range phone the absolute
savings are considerably larger.

> **Timezone note.** The obvious optimisation — reading the month off the ISO
> string with `slice(0, 7)` — is wrong. Timestamps are stored as UTC, so east of
> UTC a transaction logged just after local midnight would jump to the previous
> month. The fast path keeps local-time semantics and caches instead; there is a
> regression test pinning this (`month filter uses local time...`).

**Context** — actions are memoized once (they only close over `dispatch`, which
`useReducer` guarantees is stable) and the provider value is memoized against
state.

**Activity list** — now a `FlatList` with a bounded render window, a memoized
`DayGroup` row, a deferred search value so typing stays responsive, and a
category-name map so filtering is no longer a linear scan inside a linear scan.

## Motion

The rule is now **motion must be caused**: something the user did, or a number
that changed. Nothing animates merely because a screen exists.

- Ambient loops went from ~48 concurrent down to **exactly one** — a single
  transform-only "breathe" on the Home hero, which also stops under reduced
  motion.
- The hero's per-frame path morph is gone; the silhouette is a static path and
  the living quality comes from transforms, which stay on the UI thread and
  never re-rasterise.
- The badges' liquid "budding" is now a one-time entrance that settles, rather
  than an endless loop.
- `constants/motion.ts` holds the tokens (durations, easings, springs, press
  scales). List stagger is capped at 6 items so a long list can never become a
  multi-second cascade.
- `hooks/use-reduced-motion.ts` respects the OS accessibility setting.

Prefer transform and opacity for anything new. Animating layout properties or
SVG path data is what put this app on the floor in the first place.

## Haptics

`utils/haptics.ts` exposes semantic levels — `selection`, `toggle`, `press`,
`success`, `warning`, `error` — so call sites say what happened, not which
vibration to play.

They fire where something **changed**: a value committed, a state flipped, a
record deleted. Navigation gets none, because the screen moving is already the
feedback, and scrolling and typing get none at all. Firing on everything is what
makes an app feel cheap.
