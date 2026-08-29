import React, { useEffect, useSyncExternalStore } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { ProgressBar } from '@/components/finance/progress-bar';
import { Colors, BorderRadius, Shadows } from '@/constants/theme';
import { useMountPop } from '@/hooks/use-mount-pop';
import { haptics } from '@/utils/haptics';
import { notifyOperationComplete } from '@/utils/notifications';
import {
  cancelOperation,
  getActiveOperation,
  subscribeOperations,
  subscribeOperationCompletions,
} from '@/db/operation-status';

const OPERATION_TITLES: Record<string, string> = {
  import: 'Import finished',
  export: 'Export finished',
  'fill-test-data': 'Fill test data finished',
  reset: 'Reset finished',
};

const HIDDEN_SCREENS = new Set([
  'add-transaction',
  'add-budget',
  'add-account',
  'add-split',
  'add-recurring',
  'split-detail',
  'fill-test-data',
  'bank-import',
]);

/**
 * Root-mounted, always-visible while an operation is running — the same
 * pattern as `PersistErrorBanner` (absolute, safe-area aware, mounted once in
 * `app/_layout.tsx`, `pointerEvents="box-none"` so it never blocks the rest
 * of the screen). Fill test data, import, export, and reset all already run
 * to completion regardless of which screen is mounted (nothing cancels them
 * on unmount) — this is purely the visible piece that was missing: without
 * it, a running operation's own screen had to stay open and mounted for its
 * progress to be visible at all.
 *
 * Positioned cleanly above the FloatingTabBar on tab screens (so navigation
 * and the center '+' button are never obstructed) and just above the bottom
 * safe area on general screens (Settings, Accounts, etc.). Hidden on focused
 * modal creation/numpad screens to avoid blocking keypads or submit buttons.
 */
export const BackgroundOperationBanner: React.FC = () => {
  const operation = useSyncExternalStore(subscribeOperations, getActiveOperation, getActiveOperation);
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const mountStyle = useMountPop();

  const currentScreen = segments.length > 0 ? segments[0] : '';
  const isTabBarVisible = currentScreen === '(tabs)';
  const shouldHideOnScreen = HIDDEN_SCREENS.has(currentScreen);

  const bottomInset = insets.bottom > 0 ? insets.bottom : 12;
  // FloatingTabBar height is 64 + bottomInset; add 12px breathing room above it on tab screens
  const targetBottom = isTabBarVisible ? 64 + bottomInset + 12 : bottomInset + 12;

  const animatedBottom = useSharedValue(targetBottom);

  useEffect(() => {
    animatedBottom.value = withSpring(targetBottom, {
      damping: 24,
      stiffness: 220,
      mass: 0.8,
    });
  }, [targetBottom, animatedBottom]);

  const positionStyle = useAnimatedStyle(() => ({
    bottom: animatedBottom.value,
  }));

  // A completion while the app is foregrounded is already visible via this
  // banner's own "done" state — the notification is specifically for "I
  // switched away and it finished without me watching."
  useEffect(() => {
    return subscribeOperationCompletions(({ id, outcome }) => {
      if (AppState.currentState === 'active') return;
      void notifyOperationComplete(OPERATION_TITLES[id] ?? 'Operation finished', outcome.message);
    });
  }, []);

  // Don't show if no active operation or if on a focused modal/numpad screen
  if (!operation || shouldHideOnScreen) return null;

  const handleCancel = () => {
    haptics.warning();
    cancelOperation(operation.id);
  };

  return (
    <Animated.View
      style={[styles.wrap, positionStyle, mountStyle]}
      pointerEvents="box-none"
    >
      <View style={styles.banner}>
        {operation.progress === null ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <View style={styles.ring}>
            <AppText variant="micro" color={Colors.primary} style={styles.ringText}>
              {Math.round(operation.progress * 100)}%
            </AppText>
          </View>
        )}

        <View style={styles.copy}>
          <AppText variant="label" numberOfLines={1}>
            {operation.label}
          </AppText>
          {operation.detail ? (
            <AppText variant="micro" color={Colors.textSecondary} numberOfLines={1}>
              {operation.detail}
            </AppText>
          ) : null}
          {operation.progress !== null ? (
            <ProgressBar progress={operation.progress} height={4} style={styles.progressBar} />
          ) : null}
        </View>

        {operation.cancellable ? (
          <Pressable onPress={handleCancel} hitSlop={10} style={styles.cancelButton}>
            <Ionicons name="close" size={16} color={Colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surfaceOpaque,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    ...Shadows.lifted,
  },
  ring: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  ringText: {
    fontSize: 9,
    fontWeight: '700',
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  progressBar: {
    marginTop: 2,
  },
  cancelButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.controlBg,
  },
});

