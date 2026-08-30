import { useState, useEffect } from 'react';
import { InteractionManager, Platform } from 'react-native';

/**
 * Defers mounting of heavy components (charts, SVG heatmaps, large lists)
 * until navigation interactions and tab-switch animations have completed.
 * 
 * Returns `isReady: true` once the JS thread is free from transition work.
 * Once ready, it stays ready for the lifecycle of the component.
 *
 * A hard ceiling (`maxWaitMs`) prevents the hook from blocking indefinitely
 * when InteractionManager never fires — which happens routinely in dev mode,
 * where the tab-switch animation (`animation: 'shift'`) registers an
 * interaction that Metro's single-threaded JS doesn't retire promptly.
 * Production Hermes handles the same animation in under a frame, so the
 * ceiling only activates as a safety net there.
 */
export function useScreenReady(delayMs = 40, maxWaitMs = 300): boolean {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    let resolved = false;

    const markReady = () => {
      if (mounted && !resolved) {
        resolved = true;
        setIsReady(true);
      }
    };

    // Hard ceiling — don't wait forever for InteractionManager in dev mode.
    const ceiling = setTimeout(markReady, maxWaitMs);

    const task = InteractionManager.runAfterInteractions(() => {
      // Small timeout ensures the frame buffer is swapped before running heavy JS calculations
      const timer = setTimeout(markReady, delayMs);
      return () => clearTimeout(timer);
    });

    return () => {
      mounted = false;
      clearTimeout(ceiling);
      task.cancel();
    };
  }, [delayMs, maxWaitMs]);

  return isReady;
}
