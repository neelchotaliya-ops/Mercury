import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { GlassCard } from '@/components/ui/glass-card';
import { IconBadge } from '@/components/finance/icon-badge';
import { ProgressBar } from '@/components/finance/progress-bar';
import { useFinance } from '@/context/finance-context';
import { BudgetProgress } from '@/utils/selectors';
import { formatCurrency } from '@/utils/currency';
import { Colors } from '@/constants/theme';

export interface BudgetRowProps {
  progress: BudgetProgress;
  onPress?: () => void;
  animateIndex?: number;
}

export const BudgetRow: React.FC<BudgetRowProps> = ({ progress, onPress, animateIndex }) => {
  const { state } = useFinance();
  const { category, spent, percent, remaining, budget } = progress;
  const isOver = remaining < 0;
  const currency = state.settings.currency;

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <GlassCard style={[styles.card, { opacity: pressed ? 0.82 : 1 }]} animateIndex={animateIndex}>
          <View style={styles.header}>
            <IconBadge icon={category?.icon ?? 'pricetag'} color={category?.color ?? Colors.textMuted} size={40} />
            <View style={styles.titleCol}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {category?.name ?? 'Category'}
              </AppText>
              <AppText variant="caption">
                {formatCurrency(spent, currency)} of {formatCurrency(budget.monthlyLimit, currency)}
              </AppText>
            </View>
            <View style={styles.percentPill}>
              <AppText variant="micro" color={isOver ? Colors.expense : Colors.primary}>
                {Math.round(percent * 100)}%
              </AppText>
            </View>
          </View>

          <ProgressBar progress={percent} over={isOver} />

          <AppText variant="caption" color={isOver ? Colors.expense : Colors.textMuted}>
            {isOver
              ? `${formatCurrency(Math.abs(remaining), currency)} over budget`
              : `${formatCurrency(remaining, currency)} left this month`}
          </AppText>
        </GlassCard>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleCol: {
    flex: 1,
    gap: 3,
  },
  percentPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
});
