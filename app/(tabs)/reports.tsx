import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { DonutChart } from '@/components/finance/donut-chart';
import { TrendBarChart } from '@/components/finance/trend-bar-chart';
import { EmptyState } from '@/components/finance/empty-state';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { getCategorySpend, getMonthlyTotals } from '@/utils/selectors';
import { lastNMonthKeys, monthKeyLabel, monthShortLabel, shiftMonthKey, toMonthKey } from '@/utils/date';
import { formatCurrency } from '@/utils/currency';

export default function ReportsScreen() {
  const { colors, spacing, borderRadius } = useAppTheme();
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
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
          <EmptyState icon="pie-chart-outline" title="No expenses this month" subtitle="Add an expense to see your breakdown here." />
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder, borderRadius: borderRadius.md },
            ]}
          >
            <DonutChart
              data={categorySpend.map(c => ({ label: c.category.name, value: c.amount, color: c.category.color }))}
              centerLabel="Total"
              centerValue={formatCurrency(totalExpense, state.settings.currency)}
            />

            <View style={[styles.legendList, { marginTop: spacing.lg }]}>
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
            </View>
          </View>
        )}

        <AppText variant="h3" style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: spacing['2xl'] }]}>
          Income vs expense (6 months)
        </AppText>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder, borderRadius: borderRadius.md },
          ]}
        >
          <TrendBarChart data={trendData} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerRow: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
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
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  legendList: {
    width: '100%',
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
