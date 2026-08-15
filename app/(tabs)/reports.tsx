import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { MonthStepper } from '@/components/ui/month-stepper';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { DonutChart } from '@/components/finance/donut-chart';
import { TrendBarChart } from '@/components/finance/trend-bar-chart';
import { ProgressBar } from '@/components/finance/progress-bar';
import { IconBadge } from '@/components/finance/icon-badge';
import { EmptyState } from '@/components/finance/empty-state';
import { useFinance } from '@/context/finance-context';
import { getCategorySpend, getMonthlyTotals } from '@/utils/selectors';
import { lastNMonthKeys, monthShortLabel, toMonthKey } from '@/utils/date';
import { formatCurrency } from '@/utils/currency';
import { Colors, Spacing } from '@/constants/theme';

type Mode = 'expense' | 'income';

export default function ReportsScreen() {
  const { state } = useFinance();
  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()));
  const [mode, setMode] = useState<Mode>('expense');

  const currency = state.settings.currency;
  const breakdown = useMemo(() => getCategorySpend(state, monthKey, mode), [state, monthKey, mode]);
  const total = breakdown.reduce((sum, c) => sum + c.amount, 0);

  const trend = useMemo(
    () =>
      lastNMonthKeys(6).map(key => {
        const totals = getMonthlyTotals(state, key);
        return { label: monthShortLabel(key), income: totals.income, expense: totals.expense };
      }),
    [state]
  );

  return (
    <GradientScreen contours="top">
      <View style={styles.header}>
        <AppText variant="h2">Insights</AppText>
        <AppText variant="caption">Where your money went</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MonthStepper monthKey={monthKey} onChange={setMonthKey} />

        <SegmentedControl<Mode>
          options={[
            { key: 'expense', label: 'Spending', activeColor: Colors.expense },
            { key: 'income', label: 'Income', activeColor: Colors.income },
          ]}
          value={mode}
          onChange={setMode}
          style={styles.modeSwitch}
        />

        {breakdown.length === 0 ? (
          <GlassCard>
            <EmptyState
              icon="analytics-outline"
              title={`No ${mode === 'expense' ? 'spending' : 'income'} this month`}
              subtitle="Add a transaction to see the breakdown here."
            />
          </GlassCard>
        ) : (
          <>
            <GlassCard strong style={styles.chartCard} elevated>
              <DonutChart
                data={breakdown.map(c => ({
                  label: c.category.name,
                  value: c.amount,
                  color: c.category.color,
                }))}
                centerLabel={mode === 'expense' ? 'Total spent' : 'Total earned'}
                centerValue={formatCurrency(total, currency)}
              />
            </GlassCard>

            <GlassCard style={styles.breakdownCard} padding={18}>
              {breakdown.map((c, index) => {
                const share = total > 0 ? c.amount / total : 0;
                return (
                  <View
                    key={c.category.id}
                    style={[styles.breakdownRow, index < breakdown.length - 1 && styles.rowDivider]}
                  >
                    <IconBadge icon={c.category.icon} color={c.category.color} size={38} />
                    <View style={styles.breakdownText}>
                      <View style={styles.breakdownTop}>
                        <AppText variant="bodyStrong" numberOfLines={1} style={styles.breakdownName}>
                          {c.category.name}
                        </AppText>
                        <AppText variant="amount">{formatCurrency(c.amount, currency)}</AppText>
                      </View>
                      <View style={styles.breakdownBottom}>
                        <ProgressBar
                          progress={share}
                          height={5}
                          color={c.category.color}
                          style={styles.breakdownBar}
                        />
                        <AppText variant="micro">{Math.round(share * 100)}%</AppText>
                      </View>
                    </View>
                  </View>
                );
              })}
            </GlassCard>
          </>
        )}

        <View style={styles.trendSection}>
          <AppText variant="label" style={styles.trendLabel}>
            Last 6 months
          </AppText>
          <GlassCard style={styles.trendCard}>
            <TrendBarChart data={trend} />
          </GlassCard>
        </View>
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 3,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: Spacing.lg,
    paddingBottom: 130,
    gap: Spacing.lg,
  },
  modeSwitch: {
    marginTop: 2,
  },
  chartCard: {
    alignItems: 'center',
    paddingVertical: 26,
  },
  breakdownCard: {
    gap: 2,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  breakdownText: {
    flex: 1,
    gap: 7,
  },
  breakdownTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  breakdownName: {
    flex: 1,
  },
  breakdownBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  breakdownBar: {
    flex: 1,
  },
  trendSection: {
    gap: 10,
    marginTop: Spacing.sm,
  },
  trendLabel: {
    marginLeft: 4,
  },
  trendCard: {
    paddingVertical: 22,
  },
});
