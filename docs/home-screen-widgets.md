# Home screen widgets

Mercury ships two Android home screen widgets, built with
[`react-native-android-widget`](https://github.com/sAleksovski/react-native-android-widget).

| Widget | What it does |
| --- | --- |
| **Quick Log** | Preset tiles, each showing which account it draws from. Tapping one records the transaction **without opening the app**. Resizable — wider reveals more tiles per row, taller reveals a second row and account names. |
| **Balance & Actions** | Total balance and month-to-date spend, shortcuts into Add expense / Add income / Scan, and — when resized tall enough — a breakdown of individual account balances. |

Both are resizable in both directions from the launcher (long-press → drag the
resize handles) and redraw themselves at each new size rather than stretching
a fixed layout.

## Why a tap can log without opening the app

Widget rendering and clicks run in a **headless JS task** — real JavaScript, but
no React tree and no `FinanceProvider`. `utils/widget-data.ts` therefore talks
to AsyncStorage directly, using the same key the app does. A tap on a Quick Log
tile emits a custom `QUICK_LOG` action, the handler writes the transaction, and
the widget redraws from the result. The app is never launched.

The Balance & Actions buttons are different on purpose: each one needs input to
finish, so they deep-link (`mercury://add-transaction?type=expense`) into the
prefilled screen rather than pretending to complete silently.

## Why the app used to show a stale amount after using the widget

The widget writes straight to `AsyncStorage`, bypassing `FinanceContext`
entirely. `FinanceContext` loads state once into memory on mount and — before
this fix — never looked at storage again, so returning to the app after a
widget tap showed the old numbers until a full kill-and-relaunch re-ran that
initial load.

Fixed in `context/finance-context.tsx` with an `AppState` listener: whenever
the app transitions to `active` (bringing it to the foreground, including a
plain minimize-and-reopen — not just a cold start), it re-reads storage and
dispatches a `REFRESH_FROM_STORAGE` action. A `skipNextPersist` ref stops that
refresh from immediately writing the same bytes back out or triggering a
redundant widget redraw.

## Which account is this expense from?

Two places show this, matching what a tap will actually record:

- **Quick Log tiles**: each preset resolves its funding account the same way
  `buildPresetTransaction` does (the preset's own account, falling back to the
  first live one), and shows it as a small colour-dot + name line once the
  tile has enough room. The dot colour is also used as the tile's left accent
  bar.
- **Balance & Actions**, once resized tall enough: an account breakdown list,
  each row colour-coded to match, tapping through to the Accounts screen.
- **Settings → Widget quick presets**: each row's subtitle now includes the
  account, e.g. "Expense · Food & Dining · Main Checking".

## Resizing

RemoteViews (what these widgets ultimately render as) has no flex-wrap, so
responsive layout is decided in plain JS ahead of time from the widget's
current size in dp, then built as explicit row containers. That logic lives in
`widgets/widget-format.ts` and is covered by `npm run test:layout`:

- `quickLogSizeClass(width, height)` — picks a column count (2–4) from width
  and a row count (1–2) from height, then decides whether there's enough room
  per tile to show the account line.
- `accountRowCapacity(height)` — how many account rows fit in Balance &
  Actions once the balance block and action row are accounted for.

`widgetInfo.width`/`widgetInfo.height` (in dp) reach every render call —
`WIDGET_ADDED`, `WIDGET_UPDATE`, `WIDGET_RESIZED`, and the app's own
`refreshWidgets()` after a data change (via `requestWidgetUpdate`'s own
per-instance size callback) — so a resize takes effect immediately rather than
waiting for the next scheduled update.

## Rendering icons: a font, not `<Ionicons>`

`<Ionicons>` is a normal RN component and cannot appear inside a widget tree —
only the primitives this library exports (`FlexWidget`, `TextWidget`,
`IconWidget`, …) can. `widgets/widget-icon.tsx`'s `WidgetGlyph` instead reads
the codepoint straight out of `Ionicons.glyphMap` (a plain lookup object, safe
to read anywhere) and renders it through `IconWidget`'s `font`/`icon` props.
The font file itself is registered with the widget config plugin in
`app.json` (`fonts: [...]`, pointing at the ttf already inside
`@expo/vector-icons`), which copies it into the app's asset fonts at
prebuild time under the family name `Ionicons`.

## Presets

Presets live in persisted state as `quickPresets` and are edited in
**Settings → Widget quick presets**. Four are seeded on first run and on
upgrade, matched against whatever categories the user actually has.

A widget tap writes with no confirmation step, so `buildPresetTransaction` is
deliberately defensive — it refuses non-positive amounts, falls back to the
first live account when the preset's account was deleted or archived, and
drops a category reference that no longer exists or no longer matches the
preset's type. Covered by `npm run test:widget`.

## The React Compiler trap

`react-native-android-widget` doesn't render through React — it calls each
widget component directly as a plain function and walks the returned JSX to
build native views (`while (!jsxTree.type.__name__) { jsxTree =
jsxTree.type(jsxTree.props); }`, straight from its own source). The project's
React Compiler (`app.json` → `experiments.reactCompiler`) instruments every
component with a memoization hook regardless of how it's called, and that hook
has nothing to attach to outside a real render — so it throws "Invalid Hook
Call" the moment a widget tries to draw. The library's own error message names
the fix: a `'use no memo'` directive as the literal first line of the file (not
just inside a function — it must be the file's first statement, before any
imports, to be picked up as a directive prologue).

**Every file under `widgets/` must start with this directive.** It's easy to
forget on a new file and get a blank, silently-failing widget — the render
throws before `renderWidget()` is ever called, so nothing reaches Android for
that instance, and tapping the resulting blank space falls back to the
launcher's own "open the app" behavior, which looks like the click action
itself is broken when it never actually ran.

## Platform guard

`react-native-android-widget` also reaches for its native module on import. It
degrades to a no-op on iOS and web by itself, but on Android with the new
architecture it calls `TurboModuleRegistry.getEnforcing`, which **throws** when
the module is not linked — Expo Go, or a dev build predating the dependency.

So `utils/widget-bridge.ts` is the only module allowed to import the package. It
probes availability with the non-throwing lookups first and requires the package
lazily behind that check. Everything else — including the app entry point and
the presets screen — goes through the bridge. Do not import
`react-native-android-widget` anywhere else, or Expo Go will crash at startup.

## Code layout

| File | Role |
| --- | --- |
| `utils/widget-data.ts` | Headless reads/writes, including account balances. Pure rules split from the I/O. |
| `utils/widget-bridge.ts` | Availability probe, task registration, refresh. The only importer of the library. |
| `widgets/widget-task-handler.tsx` | Handles render and click events; threads widget size through. |
| `widgets/widget-format.ts` | Pure layout/formatting helpers — size classes, account resolution, truncation. |
| `widgets/widget-icon.tsx` | Ionicons-via-font glyph renderer for the widgets. |
| `widgets/quick-log-widget.tsx` | Quick Log UI. |
| `widgets/quick-actions-widget.tsx` | Balance & Actions UI. |
| `app/quick-presets.tsx` | Preset management screen. |
| `index.js` | Custom entry: expo-router first, then widget registration. |

Widget styles only accept solid colours, so the widgets use flattened hex
equivalents of the app's translucent glass tokens rather than importing
`constants/theme.ts` directly.

## Build requirements

Android only, and **not available in Expo Go** — widgets are native:

```bash
npx expo prebuild --clean
npx expo run:android
```

`--clean` matters whenever the widget config in `app.json` changes (new font,
new resize bounds) — otherwise the stale generated `android/` project won't
pick it up. Then long-press the home screen → Widgets → Mercury.

## Not implemented

iOS widgets. They need WidgetKit and SwiftUI, a Mac or EAS to build, and an
Apple Developer account to install — none of which the Android path requires.
Expo's own `expo-widgets` library would cover both platforms with one API, but
it requires SDK 57 and this project is on SDK 54.
