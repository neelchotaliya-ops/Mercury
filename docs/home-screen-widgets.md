# Home screen widgets

Mercury ships two Android home screen widgets, built with
[`react-native-android-widget`](https://github.com/sAleksovski/react-native-android-widget).

| Widget | What it does |
| --- | --- |
| **Quick Log** | Up to four preset tiles. Tapping one records the transaction **without opening the app**. |
| **Balance & Actions** | Total balance and month-to-date spend, plus shortcuts into Add expense / Add income / Scan. |

## Why a tap can log without opening the app

Widget rendering and clicks run in a **headless JS task** — real JavaScript, but
no React tree and no `FinanceProvider`. `utils/widget-data.ts` therefore talks
to AsyncStorage directly, using the same key the app does. A tap on a Quick Log
tile emits a custom `QUICK_LOG` action, the handler writes the transaction, and
the widget redraws from the result. The app is never launched.

The Balance & Actions buttons are different on purpose: each one needs input to
finish, so they deep-link (`mercury://add-transaction?type=expense`) into the
prefilled screen rather than pretending to complete silently.

## Presets

Presets live in persisted state as `quickPresets` and are edited in
**Settings → Widget quick presets**. Four are seeded on first run (and for
existing installs on upgrade, matched against whatever categories the user
actually has), so the widget is useful before it is configured.

Because a tap writes with no confirmation step, `buildPresetTransaction` is
deliberately defensive — it refuses non-positive amounts, falls back to the
first live account when the preset's account was deleted or archived, and drops
a category reference that no longer exists or no longer matches the preset's
type. Those rules are covered by `npm run test:widget`.

## Platform guard

`react-native-android-widget` reaches for its native module on import. It
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
| `utils/widget-data.ts` | Headless reads/writes. Pure rules split from the I/O. |
| `utils/widget-bridge.ts` | Availability probe, task registration, refresh. The only importer of the library. |
| `widgets/widget-task-handler.tsx` | Handles render and click events. |
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

Then long-press the home screen → Widgets → Mercury.

Data changes in the app call `refreshWidgets()` so placed widgets stay current;
Android additionally refreshes them on its own schedule every 30 minutes
(`updatePeriodMillis`, whose floor is 30 minutes).

## Not implemented

iOS widgets. They need WidgetKit and SwiftUI, a Mac or EAS to build, and an
Apple Developer account to install — none of which the Android path requires.
Expo's own `expo-widgets` library would cover both platforms with one API, but
it requires SDK 57 and this project is on SDK 54.
