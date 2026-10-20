import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { GlassCard } from '@/components/ui/glass-card';
import { Colors, BorderRadius } from '@/constants/theme';
import { NumberFormat, RecurringRule } from '@/types/finance';
import { RecurringFlow, projectRecurringWindows } from '@/utils/recurring-engine';
import { formatCurrency } from '@/utils/currency';

interface RecurringProjectionCardProps {
  /** Active recurring rules, already narrowed to the currency being shown. */
  rules: RecurringRule[];
  /** Current balance across the accounts in that currency. */
  balance: number;
  currency: string;
  numberFormat?: NumberFormat;
  animateIndex?: number;
}

/**
 * What the recurring rules alone will do to the balance: scheduled income,
 * scheduled spending, and what's left, for the rest of this month, the next
 * six months and the rest of the year. Only recurring items are counted —
 * one-off spending isn't predictable — so "left" is a floor to plan around,
 * not a forecast of the whole ledger.
 */
export function RecurringProjectionCard({
  rules,
  balance,
  currency,
  numberFormat,
  animateIndex,
}: RecurringProjectionCardProps) {
  const windows = useMemo(() => projectRecurringWindows(rules), [rules]);

  const now = new Date();
  const periods: { key: string; label: string; hint: string; flow: RecurringFlow }[] = [
    {
      key: 'month',
      label: 'This month',
      hint: `Rest of ${now.toLocaleDateString(undefined, { month: 'long' })}`,
      flow: windows.thisMonth,
    },
    { key: '6m', label: 'Next 6 months', hint: 'From today', flow: windows.next6Months },
    { key: 'year', label: 'This year', hint: `Until 31 Dec ${now.getFullYear()}`, flow: windows.thisYear },
  ];

  const fmt = (n: number) => formatCurrency(n, currency, numberFormat);

  return (
    <GlassCard padding={16} radius={BorderRadius.lg} animateIndex={animateIndex} style={styles.card}>
      {periods.map((period, i) => {
        const { flow } = period;
        const positive = flow.net >= 0;
        return (
          <View key={period.key} style={[styles.period, i > 0 && styles.periodDivider]}>
            <View style={styles.periodHeader}>
              <AppText variant="bodyStrong">{period.label}</AppText>
              <AppText variant="micro" color={Colors.textMuted}>
                {period.hint}
              </AppText>
            </View>

            <View style={styles.row}>
              <AppText variant="caption" color={Colors.textSecondary}>
                Recurring income
              </AppText>
              <AppText variant="bodyStrong" color={Colors.income}>
                +{fmt(flow.income)}
              </AppText>
            </View>
            <View style={styles.row}>
              <AppText variant="caption" color={Colors.textSecondary}>
                Recurring spending
              </AppText>
              <AppText variant="bodyStrong" color={Colors.expense}>
                −{fmt(flow.expense)}
              </AppText>
            </View>
            <View style={[styles.row, styles.leftRow]}>
              <AppText variant="bodyStrong">Left after recurring</AppText>
              <AppText variant="bodyStrong" color={positive ? Colors.income : Colors.expense}>
                {positive ? '' : '−'}
                {fmt(Math.abs(flow.net))}
              </AppText>
            </View>
            <AppText variant="micro" color={Colors.textMuted}>
              Balance would be {fmt(balance + flow.net)} (now {fmt(balance)})
            </AppText>
          </View>
        );
      })}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 0,
  },
  period: {
    gap: 6,
    paddingVertical: 12,
  },
  periodDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  periodHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftRow: {
    marginTop: 2,
  },
});
