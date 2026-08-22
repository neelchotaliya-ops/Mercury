import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText } from '@/components/ui/app-text';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { IconButton } from '@/components/ui/icon-button';
import { MonthStepper } from '@/components/ui/month-stepper';
import { ProgressBar } from '@/components/finance/progress-bar';
import { BudgetRow } from '@/components/finance/budget-row';
import { BudgetsSkeleton } from '@/components/finance/budgets-skeleton';
import { EmptyState } from '@/components/finance/empty-state';
import { useScreenReady } from '@/hooks/use-screen-ready';
import { useFinance } from '@/context/finance-context';
import { useBudgetProgress } from '@/hooks/use-budget-progress';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import { toMonthKey } from '@/utils/date';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

export default function BudgetsScreen() {
  const router = useRouter();
  const { state } = useFinance();
  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()));
  const isReady = useScreenReady(180);

  const uniqueCurrencies = useMemo(() => {
    const accountCurrs = state.accounts.map(a => a.currency ?? state.settings.currency ?? 'INR');
    const budgetCurrs = state.budgets.map(b => b.currency ?? 'INR');
    const list = Array.from(new Set([...accountCurrs, ...budgetCurrs]));
    return list.length > 0 ? list : [state.settings.currency ?? 'INR'];
  }, [state.accounts, state.budgets, state.settings.currency]);

  const [selectedCurrency, setSelectedCurrency] = useState<string>(uniqueCurrencies[0] ?? 'INR');
  const activeCurrency = uniqueCurrencies.includes(selectedCurrency) ? selectedCurrency : (uniqueCurrencies[0] ?? 'INR');

  // From the rollup, not a ledger scan — see db/entities.ts's
  // getBudgetProgress. Re-fetches on month change, currency filter change, or any write anywhere.
  const { data: progress } = useBudgetProgress(monthKey, activeCurrency);
  const numberFormat = state.settings.numberFormat;

  const totals = progress.reduce(
    (acc, p) => ({ limit: acc.limit + p.budget.monthlyLimit, spent: acc.spent + p.spent }),
    { limit: 0, spent: 0 }
  );
  const overallPercent = totals.limit > 0 ? totals.spent / totals.limit : 0;
  const overallOver = totals.spent > totals.limit;

  return (
    <GradientScreen>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <AppText variant="h2">Budgets</AppText>
          <AppText variant="caption">Keep your monthly spending on track</AppText>
        </View>
        <IconButton iconName="add" onPress={() => router.push('/add-budget')} solid />
      </View>

      <View style={styles.stepperWrap}>
        <MonthStepper monthKey={monthKey} onChange={setMonthKey} />
      </View>

      {uniqueCurrencies.length > 1 && (
        <View style={styles.currencyBar}>
          {uniqueCurrencies.map(c => {
            const active = c === activeCurrency;
            return (
              <Pressable
                key={c}
                onPress={() => setSelectedCurrency(c)}
                style={[
                  styles.currencyChip,
                  {
                    backgroundColor: active ? Colors.ctaBg : Colors.controlBg,
                    borderColor: active ? 'transparent' : Colors.glassBorder,
                  },
                ]}
              >
                <AppText variant="bodyStrong" color={active ? Colors.ctaText : Colors.primary}>
                  {getCurrencySymbol(c)}
                </AppText>
                <AppText variant="caption" color={active ? Colors.ctaText : Colors.textPrimary}>
                  {c}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!isReady ? (
          <BudgetsSkeleton />
        ) : progress.length === 0 ? (
          <GlassCard>
            <EmptyState
              icon="pie-chart-outline"
              title="No budgets yet"
              subtitle={`Set a monthly limit on a category for ${activeCurrency} accounts and track how much is left.`}
              actionLabel="Create a budget"
              onAction={() => router.push('/add-budget')}
            />
          </GlassCard>
        ) : (
          <>
            <GlassCard strong style={styles.summary} elevated>
              <View style={styles.summaryTop}>
                <View style={styles.summaryText}>
                  <AppText variant="label">Total budgeted ({activeCurrency})</AppText>
                  <AppText variant="h1">{formatCurrency(totals.spent, activeCurrency, numberFormat)}</AppText>
                  <AppText variant="caption">of {formatCurrency(totals.limit, activeCurrency, numberFormat)}</AppText>
                </View>
                <View style={styles.summaryPill}>
                  <AppText variant="h3" color={overallOver ? Colors.expense : Colors.primary}>
                    {Math.round(overallPercent * 100)}%
                  </AppText>
                </View>
              </View>
              <ProgressBar progress={overallPercent} over={overallOver} height={10} />
            </GlassCard>

            <View style={styles.list}>
              {progress.map((p, index) => (
                <BudgetRow
                  key={p.budget.id}
                  progress={p}
                  animateIndex={index}
                  onPress={() => router.push(`/add-budget?id=${p.budget.id}`)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 12,
  },
  headerText: {
    gap: 3,
    flex: 1,
  },
  stepperWrap: {
    marginTop: Spacing.lg,
    paddingHorizontal: 20,
  },
  currencyBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: Spacing.md,
    gap: 8,
  },
  currencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: Spacing.lg,
    paddingBottom: 130,
    gap: Spacing.lg,
  },
  summary: {
    gap: 16,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryText: {
    gap: 3,
    flex: 1,
  },
  summaryPill: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  list: {
    gap: 12,
  },
});
