import React, { useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { GlassCard } from '@/components/ui/glass-card';
import { IconBadge } from '@/components/finance/icon-badge';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { BudgetProgress } from '@/utils/selectors';
import { formatCurrency } from '@/utils/currency';
import { Gradients } from '@/constants/theme';

export interface BudgetProgressBarProps {
  progress: BudgetProgress;
  onPress?: () => void;
  animateIndex?: number;
}

export const BudgetProgressBarItem: React.FC<BudgetProgressBarProps> = ({ progress, onPress, animateIndex }) => {
  const { colors, colorScheme } = useAppTheme();
  const { state } = useFinance();

  const { category, spent, percent, budget } = progress;
  const isOver = spent > budget.monthlyLimit;
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    fillWidth.value = withTiming(Math.max(percent, 0.02) * 100, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [percent]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value}%`,
  }));

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <GlassCard style={[styles.card, { opacity: pressed ? 0.85 : 1 }]} animateIndex={animateIndex}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <IconBadge icon={category?.icon ?? 'pricetag'} color={category?.color ?? colors.textMuted} size={36} />
              <AppText variant="body" weight="semibold" style={{ color: colors.textPrimary }}>
                {category?.name ?? 'Category'}
              </AppText>
            </View>
            <AppText variant="caption" style={{ color: isOver ? '#DC2626' : colors.textSecondary }}>
              {formatCurrency(spent, state.settings.currency)} / {formatCurrency(budget.monthlyLimit, state.settings.currency)}
            </AppText>
          </View>
          <View style={[styles.track, { backgroundColor: colors.border }]}>
            <Animated.View style={[styles.fill, fillStyle]}>
              <LinearGradient
                colors={(isOver ? ['#DC2626', '#DC2626'] : Gradients[colorScheme].progress) as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
        </GlassCard>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    overflow: 'hidden',
  },
});
