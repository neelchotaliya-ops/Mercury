import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import type { NotificationResponse } from 'expo-notifications';

/**
 * Routes a tap on a recurring-payment reminder notification (see
 * utils/notifications.ts#notifyRecurringReminder) straight to that rule's
 * edit form, instead of just opening the app to wherever it last was.
 *
 * Handles both the warm case (app already running, notification tapped —
 * addNotificationResponseReceivedListener) and the cold-start case (app
 * launched by tapping the notification — getLastNotificationResponseAsync).
 *
 * @param enabled Hold routing until the navigator and stored data are ready,
 * same gating rule as useSharedReceipt.
 */
export function useNotificationResponse(enabled: boolean): void {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;

    const routeFromResponse = (response: NotificationResponse | null) => {
      const ruleId = response?.notification.request.content.data?.ruleId;
      if (typeof ruleId === 'string') {
        router.push({ pathname: '/add-recurring' as any, params: { id: ruleId } });
      }
    };

    (async () => {
      const Notifications = await import('expo-notifications');

      const last = await Notifications.getLastNotificationResponseAsync();
      if (cancelled) return;
      if (last) routeFromResponse(last);

      subscription = Notifications.addNotificationResponseReceivedListener(routeFromResponse);
    })().catch(() => {
      // Best-effort — no native module (web, an un-rebuilt dev client) or
      // anything else; the app works fine without this.
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, router]);
}
