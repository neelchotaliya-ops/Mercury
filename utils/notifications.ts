/**
 * Completion notifications for background operations (import/export/fill
 * test data/reset) — see `db/operation-status.ts`, which calls
 * `notifyOperationComplete` from `finishOperation` when the app is
 * backgrounded. Foreground completions rely on the root-mounted
 * `BackgroundOperationBanner` instead; this is purely for "I switched away
 * and it finished without me watching."
 *
 * Requires the native `expo-notifications` module — unavailable on web, and
 * on native requires the `expo-notifications` config plugin + Android's
 * `POST_NOTIFICATIONS` permission (both wired in app.json) to actually be
 * baked into a rebuilt native project. Every call here is best-effort: a
 * failure (permission denied, module unavailable) should never surface as
 * an error to the operation itself, which already succeeded or failed on
 * its own merits by the time this runs.
 */

import { Platform } from 'react-native';

const CHANNEL_ID = 'mercury-operations';

let readyPromise: Promise<void> | null = null;

async function setup(): Promise<void> {
  if (Platform.OS === 'web') return;

  const Notifications = await import('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Background operations',
      description: 'Lets you know when an import, export, or bulk data operation finishes.',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    await Notifications.requestPermissionsAsync();
  }
}

/** Idempotent — safe to call from every screen that might need it; only sets up once. */
export function ensureNotificationsReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = setup().catch(() => {
      // Best-effort: no permission, no native module (web, an un-rebuilt
      // dev client), or anything else — the app works fine without this.
    });
  }
  return readyPromise;
}

export async function notifyOperationComplete(title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await ensureNotificationsReady();
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch {
    // Best-effort — see file header.
  }
}

/**
 * A due/missed recurring-payment reminder. Carries a `ruleId` payload so
 * tapping it can route straight to that rule (see
 * hooks/use-notification-response.ts) instead of just opening the app to
 * wherever it last was.
 */
export async function notifyRecurringReminder(
  title: string,
  body: string,
  ruleId: string
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await ensureNotificationsReady();
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { ruleId } },
      trigger: null,
    });
  } catch {
    // Best-effort — see file header.
  }
}
