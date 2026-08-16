import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Semantic haptics.
 *
 * Call sites name *what happened*, not which vibration to play, so the feel of
 * the app can be tuned in one place.
 *
 * The rule for where these belong: haptics confirm that something changed.
 * A tap that navigates somewhere gets no haptic — the screen moving is already
 * the feedback. A tap that commits a value, flips a state, or destroys
 * something does, because there is otherwise nothing physical to confirm it.
 * Firing on everything is what makes an app feel cheap and drains battery, so
 * scrolling, plain navigation, and text entry are deliberately silent.
 *
 * Every call is fire-and-forget and failure is ignored: haptics are unavailable
 * on web, on some Android hardware, and when the user has disabled them
 * system-wide. None of that should ever surface as an error.
 */

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

function fire(run: () => Promise<void>): void {
  if (!supported) return;
  run().catch(() => {});
}

export const haptics = {
  /**
   * A discrete value changed under the finger: a keypad digit, a stepper, a
   * segment in a control. The lightest tick available.
   */
  selection(): void {
    fire(() => Haptics.selectionAsync());
  },

  /** A toggle, chip, or filter flipped state. */
  toggle(): void {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },

  /** A primary button was pressed and is about to do real work. */
  press(): void {
    fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },

  /** Something was saved or completed successfully. */
  success(): void {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },

  /** A destructive action went through, or an operation failed. */
  warning(): void {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },

  /** An action was rejected — invalid input, nothing to save. */
  error(): void {
    fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
} as const;
