import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Colors, BorderRadius, Shadows } from '@/constants/theme';
import { useFinance } from '@/context/finance-context';
import { useMountPop } from '@/hooks/use-mount-pop';

/**
 * Shown when a save has failed.
 *
 * A failed write means the ledger in memory is ahead of what is on disk and
 * dies with the process. That used to be a `console.warn` nobody would ever
 * read — the user's first sign of trouble was missing transactions after a
 * relaunch. This is deliberately loud and persistent (no auto-dismiss): it
 * stays until a write succeeds, and it offers the one action that actually
 * rescues the data, which is exporting a backup off-device.
 */
export const PersistErrorBanner: React.FC = () => {
  const { persistError } = useFinance();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mountStyle = useMountPop();

  if (!persistError) return null;

  return (
    <Animated.View
      style={[styles.wrap, { top: insets.top + 8 }, mountStyle]}
      pointerEvents="box-none"
    >
      <Pressable onPress={() => router.push('/settings')}>
        <View style={styles.banner}>
          <Ionicons name="warning" size={18} color={Colors.expense} />
          <View style={styles.copy}>
            <AppText variant="label" color={Colors.textPrimary}>
              Your data isn&apos;t saving
            </AppText>
            <AppText variant="micro" color={Colors.textSecondary}>
              {persistError} Tap to export a backup.
            </AppText>
          </View>
        </View>
      </Pressable>
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
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: Colors.expense,
    ...Shadows.lifted,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
});
