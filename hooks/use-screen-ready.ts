import { useState, useEffect } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Defers mounting of heavy components (charts, SVG heatmaps, large lists)
 * until navigation interactions and tab-switch animations have completed.
 * 
 * Returns `isReady: true` once the JS thread is free from transition work.
 * Once ready, it stays ready for the lifecycle of the component.
 */
export function useScreenReady(delayMs = 40): boolean {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const task = InteractionManager.runAfterInteractions(() => {
      // Small timeout ensures the frame buffer is swapped before running heavy JS calculations
      const timer = setTimeout(() => {
        if (mounted) {
          setIsReady(true);
        }
      }, delayMs);

      return () => clearTimeout(timer);
    });

    return () => {
      mounted = false;
      task.cancel();
    };
  }, [delayMs]);

  return isReady;
}
