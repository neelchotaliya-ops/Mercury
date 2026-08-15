import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconBadge } from '@/components/finance/icon-badge';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { BudgetProgress } from '@/utils/selectors';
import { formatCurrency } from '@/utils/currency';

export interface BudgetProgressBarProps {
  progress: BudgetProgress;
  onPress?: () => void;
}

export const BudgetProgressBarItem: React.FC<BudgetProgressBarProps> = ({ progress, onPress }) => {
  const { colors, borderRadius, spacing } = useAppTheme();
  const { state } = useFinance();

  const { category, spent, percent, budget } = progress;
  const isOver = spent > budget.monthlyLimit;
  const barColor = isOver ? '#DC2626' : category?.color ?? colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
          borderRadius: borderRadius.md,
          padding: spacing.lg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
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
        <View
          style={[
            styles.fill,
            { width: `${Math.max(percent, 0.02) * 100}%`, backgroundColor: barColor },
          ]}
        />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
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
  },
});
