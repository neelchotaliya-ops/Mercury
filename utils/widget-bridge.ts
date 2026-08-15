/**
 * The single place that decides whether home screen widgets are usable, and
 * the only place allowed to pull in `react-native-android-widget`.
 *
 * That package reaches for its native module as soon as it is imported. On iOS
 * and web it degrades to a no-op module by itself, but on Android with the new
 * architecture it calls `TurboModuleRegistry.getEnforcing`, which throws when
 * the module is not linked — Expo Go, or a dev build predating the dependency.
 * So availability is probed with the non-throwing lookups first, and the
 * package is only required once that probe passes.
 */

import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

const WIDGET_NAMES = ['QuickLog', 'QuickActions'] as const;

let cachedSupport: boolean | undefined;

/** True only in an Android build that actually links the widget module. */
export function isWidgetSupported(): boolean {
  if (cachedSupport !== undefined) return cachedSupport;

  if (Platform.OS !== 'android') {
    cachedSupport = false;
    return cachedSupport;
  }

  try {
    // `get` returns null when absent, unlike the enforcing variant.
    cachedSupport =
      TurboModuleRegistry.get('AndroidWidget') != null || NativeModules.AndroidWidget != null;
  } catch {
    cachedSupport = false;
  }

  return cachedSupport;
}

/**
 * Registers the background task that draws widgets and handles their taps.
 * Called once from the app entry point.
 */
export function registerWidgets(): void {
  if (!isWidgetSupported()) return;

  /* eslint-disable @typescript-eslint/no-require-imports */
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('@/widgets/widget-task-handler');
  /* eslint-enable @typescript-eslint/no-require-imports */

  registerWidgetTaskHandler(widgetTaskHandler);
}

/**
 * Redraws every placed widget. Call after anything the widgets display
 * changes — a new transaction, or edited presets.
 */
export async function refreshWidgets(): Promise<void> {
  if (!isWidgetSupported()) return;

  /* eslint-disable @typescript-eslint/no-require-imports */
  const { requestWidgetUpdate } = require('react-native-android-widget');
  const { renderWidgetByName } = require('@/widgets/widget-task-handler');
  /* eslint-enable @typescript-eslint/no-require-imports */

  await Promise.all(
    WIDGET_NAMES.map(widgetName =>
      requestWidgetUpdate({
        widgetName,
        renderWidget: () => renderWidgetByName(widgetName),
        // No widget of this name on the home screen; nothing to do.
        widgetNotFound: () => {},
      }).catch(() => {})
    )
  );
}
