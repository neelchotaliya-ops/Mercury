import React from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Colors, BorderRadius, Shadows } from '@/constants/theme';

export interface ScanReceiptButtonProps {
  onPickImage: () => void;
  onOpenCamera?: () => void;
  scanning?: boolean;
}

/**
 * Entry point for reading a payment screenshot. Sits above the amount field on
 * the add-transaction screen so the fast path is the first thing in reach.
 */
export const ScanReceiptButton: React.FC<ScanReceiptButtonProps> = ({
  onPickImage,
  onOpenCamera,
  scanning = false,
}) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const press = (action?: () => void) => () => {
    if (scanning || !action) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    action();
  };

  return (
    <Animated.View style={[styles.wrap, animatedStyle]}>
      <Pressable
        onPress={press(onPickImage)}
        onPressIn={() => {
          scale.value = withSpring(0.98, { damping: 18, stiffness: 260 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 260 });
        }}
        disabled={scanning}
        style={styles.pressable}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.95)', 'rgba(247,236,250,0.78)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.iconTile}>
            {scanning ? (
              <ActivityIndicator size="small" color={Colors.primaryDeep} />
            ) : (
              <Ionicons name="sparkles" size={19} color={Colors.primaryDeep} />
            )}
          </View>

          <View style={styles.copy}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {scanning ? 'Reading screenshot…' : 'Scan a payment screenshot'}
            </AppText>
            <AppText variant="micro" numberOfLines={1}>
              {scanning ? 'Everything stays on your device' : 'Auto-fills from Google Pay, PhonePe & more'}
            </AppText>
          </View>

          {onOpenCamera && !scanning ? (
            <Pressable onPress={press(onOpenCamera)} hitSlop={10} style={styles.cameraBtn}>
              <Ionicons name="camera-outline" size={18} color={Colors.textSecondary} />
            </Pressable>
          ) : null}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    ...Shadows.soft,
  },
  pressable: {
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  cameraBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
});
