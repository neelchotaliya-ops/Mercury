import { useEffect } from 'react';
import { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Duration, Ease } from '@/constants/motion';
import { useReducedMotion } from './use-reduced-motion';

/**
 * The app's one entrance signature: a soft pop, not a slide. Every surface
 * that enters — cards, the hero, sheets — uses this same animated style, so
 * motion reads as one consistent language.
 *
 * Deliberately NOT built on Reanimated's `entering=` prop. A transform inside
 * `withInitialValues()` on an `entering` animation (Keyframe or builder API,
 * regardless of easing) has a real, reproducible bug on react-native-web: it
 * makes the enclosing ScrollView measure its content height from a stale
 * mid-animation snapshot, compressing everything after the first couple of
 * cards into an overlapping stack (confirmed against `prefers-reduced-motion`,
 * which bypasses the buggy code path and renders correctly). Driving the same
 * visual with a plain `useSharedValue` + `useAnimatedStyle` that starts
 * animating a millisecond after mount never touches that measurement
 * subsystem, so it sidesteps the bug entirely — the same pattern already used
 * for chart reveals and the hero's press reaction.
 *
 * Pass `enabled: false` for a card that must appear instantly (e.g. one
 * swapped in as the direct result of the user's own tap) rather than
 * conditionally calling this hook, which would break the Rules of Hooks.
 */
export function useMountPop(delayMs = 0, enabled = true) {
  const reducedMotion = useReducedMotion();
  const skip = !enabled || reducedMotion;
  const progress = useSharedValue(skip ? 1 : 0);

  useEffect(() => {
    if (skip) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withDelay(
      delayMs,
      withTiming(1, { duration: Duration.base + 90, easing: Ease.emphasis })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delayMs, skip]);

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: 0.92 + progress.value * 0.08 },
      { translateY: (1 - progress.value) * 10 },
    ],
  }));
}
