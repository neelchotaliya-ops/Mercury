import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { OrganicHeroCard } from '@/components/ui/organic-hero-card';
import { DonutChart } from '@/components/finance/donut-chart';
import { TrendBarChart } from '@/components/finance/trend-bar-chart';
import { EmptyState } from '@/components/finance/empty-state';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { getCategorySpend, getMonthlyTotals } from '@/utils/selectors';
import { lastNMonthKeys, monthKeyLabel, monthShortLabel, shiftMonthKey, toMonthKey } from '@/utils/date';
import { formatCurrency } from '@/utils/currency';

export default function ReportsScreen() {
  const { colors, spacing } = useAppTheme();
  const { state } = useFinance();
  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()));

  const categorySpend = useMemo(() => getCategorySpend(state, monthKey, 'expense'), [state, monthKey]);
  const totalExpense = categorySpend.reduce((sum, c) => sum + c.amount, 0);

  const trendData = useMemo(() => {
    const keys = lastNMonthKeys(6);
    return keys.map(key => {
      const totals = getMonthlyTotals(state, key);
      return { label: monthShortLabel(key), income: totals.income, expense: totals.expense };
    });
  }, [state]);

  return (
    <GradientScreen showRings>
      <View style={styles.headerRow}>
        <AppText variant="h2" style={{ color: colors.textPrimary }}>
          Reports
        </AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => setMonthKey(k => shiftMonthKey(k, -1))} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </Pressable>
          <AppText variant="body" weight="semibold" style={{ color: colors.textPrimary }}>
            {monthKeyLabel(monthKey)}
          </AppText>
          <Pressable onPress={() => setMonthKey(k => shiftMonthKey(k, 1))} hitSlop={10}>
            <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <AppText variant="h3" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          Spending by category
        </AppText>

        {categorySpend.length === 0 ? (
          <GlassCard>
            <EmptyState icon="pie-chart-outline" title="No expenses this month" subtitle="Add an expense to see your breakdown here." />
          </GlassCard>
        ) : (
          <>
            <OrganicHeroCard size={190}>
              <DonutChart
                data={categorySpend.map(c => ({ label: c.category.name, value: c.amount, color: c.category.color }))}
                size={150}
                centerLabel="Total"
                centerValue={formatCurrency(totalExpense, state.settings.currency)}
              />
            </OrganicHeroCard>

            <GlassCard style={[styles.legendCard, { marginTop: spacing.lg }]} animateIndex={0}>
              {categorySpend.map(c => {
                const percent = totalExpense > 0 ? Math.round((c.amount / totalExpense) * 100) : 0;
                return (
                  <View key={c.category.id} style={styles.legendRow}>
                    <View style={styles.legendLeft}>
                      <View style={[styles.legendDot, { backgroundColor: c.category.color }]} />
                      <AppText variant="body" style={{ color: colors.textPrimary }}>
                        {c.category.name}
                      </AppText>
                    </View>
                    <AppText variant="body" style={{ color: colors.textSecondary }}>
                      {formatCurrency(c.amount, state.settings.currency)} · {percent}%
                    </AppText>
                  </View>
                );
              })}
            </GlassCard>
          </>
        )}

        <AppText variant="h3" style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: spacing['2xl'] }]}>
          Income vs expense (6 months)
        </AppText>
        <GlassCard style={styles.card} animateIndex={1}>
          <TrendBarChart data={trendData} />
        </GlassCard>
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 140,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  card: {
    padding: 20,
    alignItems: 'center',
  },
  legendCard: {
    gap: 10,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
