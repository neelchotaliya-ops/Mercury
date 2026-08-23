import React, { useSyncExternalStore } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { ProgressBar } from '@/components/finance/progress-bar';
import { Colors, BorderRadius, Shadows } from '@/constants/theme';
import { useMountPop } from '@/hooks/use-mount-pop';
import { haptics } from '@/utils/haptics';
import {
  cancelOperation,
  getActiveOperation,
  subscribeOperations,
} from '@/db/operation-status';

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
 * Pinned to the bottom (a `PersistErrorBanner`, if also showing, sits near
 * the top) so the two never overlap.
 */
export const BackgroundOperationBanner: React.FC = () => {
  const operation = useSyncExternalStore(subscribeOperations, getActiveOperation, getActiveOperation);
  const insets = useSafeAreaInsets();
  const mountStyle = useMountPop();

  if (!operation) return null;

  const handleCancel = () => {
    haptics.warning();
    cancelOperation(operation.id);
  };

  return (
    <Animated.View
      style={[styles.wrap, { bottom: insets.bottom + 12 }, mountStyle]}
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
    backgroundColor: '#FFFFFF',
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
