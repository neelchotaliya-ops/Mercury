import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { useSharedValue, withSpring } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';

import { useReducedMotion } from '@/hooks/use-reduced-motion';

const UPDATE_INTERVAL_MS = 32;

/**
 * Pixel offset the hero blob rolls toward as the phone tilts, driven by the
 * accelerometer's gravity vector. `x`/`y` readings are in g's (roughly -1..1
 * near upright hold) so they map fairly directly onto a small pixel range —
 * no calibration step needed, tilting left/right or forward/back just nudges
 * the blob that way.
 *
 * Each sample re-targets a `withSpring` on the UI thread rather than setting
 * the shared value directly, which is what turns raw, jittery sensor noise
 * into something that reads as the blob settling under gravity instead of
 * rigidly tracking the phone.
 *
 * Native only (web has no consistent accelerometer without its own
 * permission-prompt flow — not worth it for a decorative touch) and off
 * entirely under reduced motion, since tilt-driven movement is exactly the
 * kind of motion that setting exists to suppress. Subscribes only while the
 * screen is focused so a background tab isn't waking the sensor.
 */
export function useTiltGravity(maxOffset = 14) {
  const gx = useSharedValue(0);
  const gy = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useFocusEffect(
    useCallback(() => {
      if (reducedMotion || Platform.OS === 'web') return;

      let cancelled = false;
      const springConfig = { damping: 9, stiffness: 60, mass: 0.6 };

      Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);
      const sub = Accelerometer.addListener(({ x, y }) => {
        if (cancelled) return;
        // Portrait hold: tilting the phone left/right (x) rolls the blob
        // sideways; tilting forward/back (y) rolls it up/down. Clamped so a
        // sharp tilt can't fling it out of its container.
        const targetX = Math.max(-maxOffset, Math.min(maxOffset, x * maxOffset * 1.4));
        const targetY = Math.max(-maxOffset, Math.min(maxOffset, -y * maxOffset * 1.4));
        gx.value = withSpring(targetX, springConfig);
        gy.value = withSpring(targetY, springConfig);
      });

      return () => {
        cancelled = true;
        sub.remove();
        gx.value = withSpring(0, springConfig);
        gy.value = withSpring(0, springConfig);
      };
    }, [reducedMotion, maxOffset, gx, gy])
  );

  // Stable across renders (gx/gy refs never change) so passing this down to
  // a memoized child — the satellite bubbles — doesn't defeat their memo.
  return useMemo(() => ({ gx, gy }), [gx, gy]);
}
