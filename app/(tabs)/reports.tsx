import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState } from '@/components/finance/empty-state';
import { InsightFilters } from '@/components/finance/insight-filters';
import { TrendAreaChart } from '@/components/charts/trend-area-chart';
import { CategoryDonut } from '@/components/charts/category-donut';
import { WeekdayBars } from '@/components/charts/weekday-bars';
import { CalendarHeatmap } from '@/components/charts/calendar-heatmap';
import { useFinance } from '@/context/finance-context';
import {
  DEFAULT_INSIGHT_FILTER,
  InsightFilter,
  compareWithPreviousPeriod,
  computeCategoryBreakdown,
  computeDailyHeatmap,
  computeMonthlySeries,
  computeTopNotes,
  computeTotals,
  computeWeekdayPattern,
  resolveRange,
  selectTransactions,
} from '@/utils/insights';
import { formatCurrency } from '@/utils/currency';
import { monthKeyLabel } from '@/utils/date';
import { Colors, Spacing } from '@/constants/theme';

type Kind = 'expense' | 'income';

export default function ReportsScreen() {
  const { state } = useFinance();
  const [filter, setFilter] = useState<InsightFilter>(DEFAULT_INSIGHT_FILTER);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | undefined>();

  const currency = state.settings.currency;

  // The ledger is scanned once here; every chart below reads this array.
  const transactions = useMemo(() => selectTransactions(state, filter), [state, filter]);
  const totals = useMemo(() => computeTotals(transactions), [transactions]);
  const breakdown = useMemo(
    () => computeCategoryBreakdown(transactions, state.categories),
    [transactions, state.categories]
  );
  const range = useMemo(() => resolveRange(filter.range), [filter.range]);
  const series = useMemo(() => computeMonthlySeries(transactions, range), [transactions, range]);
  const heatmapWeeks = useMemo(
    () => computeDailyHeatmap(transactions, range),
    [transactions, range]
  );
  const weekdays = useMemo(() => computeWeekdayPattern(transactions), [transactions]);
  const topNotes = useMemo(() => computeTopNotes(transactions), [transactions]);
  const comparison = useMemo(() => compareWithPreviousPeriod(state, filter), [state, filter]);

  const isEmpty = transactions.length === 0;
  const changePercent =
    comparison.change !== undefined ? Math.round(comparison.change * 100) : undefined;
  const spendingUp = (comparison.change ?? 0) > 0;

  return (
    <GradientScreen contours="top">
      <View style={styles.header}>
        <AppText variant="h2">Insights</AppText>
        <AppText variant="caption">Where your money actually goes</AppText>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.kindWrap}>
          <SegmentedControl<Kind>
            options={[
              { key: 'expense', label: 'Spending', activeColor: Colors.expense },
              { key: 'income', label: 'Income', activeColor: Colors.income },
            ]}
            value={filter.kind}
            onChange={kind => {
              // Category ids belong to one kind, so they cannot carry over.
              setFilter({ ...filter, kind, categoryIds: [] });
              setSelectedCategory(undefined);
            }}
          />
        </View>

        <InsightFilters
          filter={filter}
          accounts={state.accounts}
          categories={state.categories}
          onChange={next => {
            setFilter(next);
            setSelectedCategory(undefined);
            setSelectedDay(undefined);
          }}
        />

        {isEmpty ? (
          <View style={styles.section}>
            <GlassCard>
              <EmptyState
                icon="analytics-outline"
                title="Nothing in this range"
                subtitle="Widen the date range or clear a filter to see your numbers."
              />
            </GlassCard>
          </View>
        ) : (
          <>
            {/* The headline is one number, so it gets a stat tile rather than a chart. */}
            <View style={styles.section}>
              <GlassCard strong elevated style={styles.heroCard} animateIndex={0}>
                <AppText variant="micro">
                  {filter.kind === 'expense' ? 'Total spent' : 'Total received'}
                </AppText>
                <AppText variant="display" numberOfLines={1} adjustsFontSizeToFit>
                  {formatCurrency(totals.total, currency)}
                </AppText>
                {changePercent !== undefined ? (
                  <AppText
                    variant="micro"
                    color={
                      filter.kind === 'expense'
                        ? spendingUp
                          ? Colors.expense
                          : Colors.income
                        : spendingUp
                          ? Colors.income
                          : Colors.expense
                    }
                  >
                    {spendingUp ? '▲' : '▼'} {Math.abs(changePercent)}% vs previous period
                  </AppText>
                ) : (
                  <AppText variant="micro">No earlier period to compare against</AppText>
                )}

                <View style={styles.statRow}>
                  <View style={styles.stat}>
                    <AppText variant="micro">Per active day</AppText>
                    <AppText variant="bodyStrong">
                      {formatCurrency(totals.dailyAverage, currency)}
                    </AppText>
                  </View>
                  <View style={styles.stat}>
                    <AppText variant="micro">Entries</AppText>
                    <AppText variant="bodyStrong">{totals.count}</AppText>
                  </View>
                  <View style={styles.stat}>
                    <AppText variant="micro">Largest</AppText>
                    <AppText variant="bodyStrong">
                      {totals.largest ? formatCurrency(totals.largest.amount, currency) : '—'}
                    </AppText>
                  </View>
                </View>
              </GlassCard>
            </View>

            <View style={styles.section}>
              <AppText variant="label" style={styles.sectionLabel}>
                Trend by month
              </AppText>
              <GlassCard style={styles.chartCard} animateIndex={1}>
                <TrendAreaChart
                  points={series}
                  currency={currency}
                  selectedIndex={selectedMonth}
                  onSelect={setSelectedMonth}
                />
                {selectedMonth !== undefined && series[selectedMonth] ? (
                  <View style={styles.selection}>
                    <AppText variant="micro">{monthKeyLabel(series[selectedMonth].monthKey)}</AppText>
                    <AppText variant="bodyStrong">
                      {formatCurrency(series[selectedMonth].amount, currency)}
                    </AppText>
                  </View>
                ) : null}
              </GlassCard>
            </View>

            <View style={styles.section}>
              <AppText variant="label" style={styles.sectionLabel}>
                By category
              </AppText>
              <GlassCard style={styles.chartCard} animateIndex={2}>
                <CategoryDonut
                  slices={breakdown}
                  currency={currency}
                  centerLabel={filter.kind === 'expense' ? 'Spent' : 'Received'}
                  total={totals.total}
                  selectedId={selectedCategory}
                  onSelect={setSelectedCategory}
                />
              </GlassCard>
            </View>

            <View style={styles.section}>
              <AppText variant="label" style={styles.sectionLabel}>
                Daily activity
              </AppText>
              <GlassCard style={styles.chartCard} animateIndex={3}>
                <CalendarHeatmap
                  weeks={heatmapWeeks}
                  currency={currency}
                  selectedKey={selectedDay}
                  onSelect={setSelectedDay}
                />
                {selectedDay ? (
                  <View style={styles.selection}>
                    <AppText variant="micro">
                      {new Date(selectedDay).toLocaleDateString(undefined, {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </AppText>
                    <AppText variant="bodyStrong">
                      {formatCurrency(
                        heatmapWeeks
                          .flatMap(w => w.days)
                          .find(d => d?.dateKey === selectedDay)?.amount ?? 0,
                        currency
                      )}
                    </AppText>
                  </View>
                ) : null}
              </GlassCard>
            </View>

            <View style={styles.section}>
              <AppText variant="label" style={styles.sectionLabel}>
                Busiest days
              </AppText>
              <GlassCard style={styles.chartCard} animateIndex={4}>
                <WeekdayBars buckets={weekdays} currency={currency} />
              </GlassCard>
            </View>

            {topNotes.length > 0 ? (
              <View style={styles.section}>
                <AppText variant="label" style={styles.sectionLabel}>
                  Most frequent
                </AppText>
                <GlassCard padding={18} animateIndex={5}>
                  {topNotes.map((note, index) => (
                    <View
                      key={note.label}
                      style={[styles.noteRow, index < topNotes.length - 1 && styles.noteDivider]}
                    >
                      <View style={styles.noteText}>
                        <AppText variant="bodyStrong" numberOfLines={1}>
                          {note.label}
                        </AppText>
                        <AppText variant="micro">
                          {note.count} {note.count === 1 ? 'time' : 'times'}
                        </AppText>
                      </View>
                      <AppText variant="amount">{formatCurrency(note.amount, currency)}</AppText>
                    </View>
                  ))}
                </GlassCard>
              </View>
            ) : null}
          </>
        )}
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
    paddingTop: Spacing.lg,
    paddingBottom: 130,
    gap: Spacing.lg,
  },
  kindWrap: {
    paddingHorizontal: 20,
  },
  section: {
    paddingHorizontal: 20,
    gap: 10,
  },
  sectionLabel: {
    marginLeft: 4,
  },
  heroCard: {
    gap: 4,
    paddingVertical: 20,
  },
  statRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 10,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  chartCard: {
    paddingVertical: 20,
    gap: 12,
  },
  selection: {
    alignItems: 'center',
    gap: 1,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  noteDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  noteText: {
    flex: 1,
    gap: 2,
  },
});
