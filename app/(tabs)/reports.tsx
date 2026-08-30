import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

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
import { ReportsSkeleton } from '@/components/finance/reports-skeleton';
import { useScreenReady } from '@/hooks/use-screen-ready';
import { useFinance } from '@/context/finance-context';
import {
  DEFAULT_INSIGHT_FILTER,
  InsightFilter,
  RecurringInsights,
  SplitInsights,
  SubcategorySlice,
  getRecurringInsights,
  getSplitInsights,
  computeSubcategoryBreakdown,
} from '@/db/insights';
import { useInsightsData } from '@/hooks/use-insights-data';
import { useDbQuery } from '@/hooks/use-db-query';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import { monthKeyLabel } from '@/utils/date';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { RecurringSummaryCard } from '@/components/finance/recurring-insights';
import { SplitSummaryCard } from '@/components/finance/split-insights';
import { ProgressBar } from '@/components/finance/progress-bar';
import { IconBadge } from '@/components/finance/icon-badge';

type Kind = 'expense' | 'income';

export default function ReportsScreen() {
  const { state } = useFinance();
  const [filter, setFilter] = useState<InsightFilter>(DEFAULT_INSIGHT_FILTER);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | undefined>();

  const { data: recurringData } = useDbQuery<RecurringInsights | null>(
    'reports-recurring-insights',
    db => getRecurringInsights(db),
    null
  );
  const { data: splitData } = useDbQuery<SplitInsights | null>(
    'reports-split-insights',
    db => getSplitInsights(db),
    null
  );

  const isReady = useScreenReady();

  const uniqueCurrencies = useMemo(() => {
    const list = Array.from(
      new Set(state.accounts.map(a => a.currency ?? state.settings.currency ?? 'INR'))
    );
    return list.length > 0 ? list : [state.settings.currency ?? 'INR'];
  }, [state.accounts, state.settings.currency]);

  const [selectedCurrency, setSelectedCurrency] = useState<string>(uniqueCurrencies[0] ?? 'INR');
  const activeCurrency = uniqueCurrencies.includes(selectedCurrency)
    ? selectedCurrency
    : (uniqueCurrencies[0] ?? 'INR');

  const currencyAccounts = useMemo(
    () => state.accounts.filter(a => (a.currency ?? state.settings.currency ?? 'INR') === activeCurrency),
    [state.accounts, state.settings.currency, activeCurrency]
  );

  const effectiveFilter = useMemo<InsightFilter>(() => {
    if (uniqueCurrencies.length <= 1) return filter;
    const validCurrencyAccountIds = currencyAccounts.map(a => a.id);
    const selectedInCurrency = filter.accountIds.filter(id => validCurrencyAccountIds.includes(id));
    return {
      ...filter,
      accountIds: selectedInCurrency.length > 0 ? selectedInCurrency : validCurrencyAccountIds,
    };
  }, [filter, uniqueCurrencies, currencyAccounts]);

  const numberFormat = state.settings.numberFormat;

  const { totals, breakdown, series, heatmap: heatmapWeeks, weekdays, topNotes, comparison, loading } =
    useInsightsData(effectiveFilter, state.categories);

  // Drills one level below the category donut — only queried once a slice is
  // actually selected, since it can't use the rollup fast path (see
  // computeSubcategoryBreakdown's own comment on why).
  const { data: subcategoryBreakdown } = useDbQuery<SubcategorySlice[]>(
    `${JSON.stringify(effectiveFilter)}|${selectedCategory ?? ''}`,
    db =>
      selectedCategory
        ? computeSubcategoryBreakdown(db, effectiveFilter, selectedCategory, state.subcategories ?? [])
        : Promise.resolve([]),
    []
  );
  const selectedCategoryObj = state.categories.find(c => c.id === selectedCategory);

  const contentOpacity = useSharedValue(1);
  useEffect(() => {
    contentOpacity.value = withTiming(loading ? 0.5 : 1, { duration: 180 });
  }, [loading, contentOpacity]);
  const refreshingStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));

  const isEmpty = totals.count === 0;
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

        {uniqueCurrencies.length > 1 && (
          <View style={styles.currencyBar}>
            {uniqueCurrencies.map(c => {
              const active = c === activeCurrency;
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    setSelectedCurrency(c);
                    setFilter(prev => ({ ...prev, accountIds: [] }));
                  }}
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

        <InsightFilters
          filter={filter}
          accounts={currencyAccounts}
          categories={state.categories}
          onChange={next => {
            setFilter(next);
            setSelectedCategory(undefined);
            setSelectedDay(undefined);
          }}
        />

        {/* Recurring/Split used to be full management tabs behind a 3-way
            switch; they're glanceable summaries here now, with a link into
            the Manage hub for anything beyond a glance. Shown unconditionally
            (not gated on the Spending section's own loading/empty state)
            since they reflect independent data. */}
        <View style={styles.summarySection}>
          <RecurringSummaryCard insights={recurringData} />
          <SplitSummaryCard insights={splitData} />
        </View>

        {isReady && loading ? (
          <View style={styles.refreshingRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <AppText variant="micro" color={Colors.textSecondary}>
              Updating…
            </AppText>
          </View>
        ) : null}

        {!isReady ? (
          <ReportsSkeleton />
        ) : isEmpty ? (
          <View style={styles.section}>
            <GlassCard>
              <EmptyState
                icon="analytics-outline"
                title={`No ${activeCurrency} data in this range`}
                subtitle="Widen the date range or clear a filter to see your numbers."
              />
            </GlassCard>
          </View>
        ) : (
          <Animated.View style={[styles.sections, refreshingStyle]}>
            {/* The headline is one number, so it gets a stat tile rather than a chart. */}
            <View style={styles.section}>
              <GlassCard strong elevated style={styles.heroCard} animateIndex={0}>
                <AppText variant="micro">
                  {filter.kind === 'expense' ? 'Total spent' : 'Total received'}
                </AppText>
                <AppText variant="display" numberOfLines={1} adjustsFontSizeToFit>
                  {formatCurrency(totals.total, activeCurrency, numberFormat)}
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
                      {formatCurrency(totals.dailyAverage, activeCurrency, numberFormat)}
                    </AppText>
                  </View>
                  <View style={styles.stat}>
                    <AppText variant="micro">Entries</AppText>
                    <AppText variant="bodyStrong">{totals.count}</AppText>
                  </View>
                  <View style={styles.stat}>
                    <AppText variant="micro">Largest</AppText>
                    <AppText variant="bodyStrong">
                      {totals.largestAmount !== undefined ? formatCurrency(totals.largestAmount, activeCurrency, numberFormat) : '—'}
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
                  currency={activeCurrency}
                  numberFormat={numberFormat}
                  selectedIndex={selectedMonth}
                  onSelect={setSelectedMonth}
                />
                {selectedMonth !== undefined && series[selectedMonth] ? (
                  <View style={styles.selection}>
                    <AppText variant="micro">{monthKeyLabel(series[selectedMonth].monthKey)}</AppText>
                    <AppText variant="bodyStrong">
                      {formatCurrency(series[selectedMonth].amount, activeCurrency, numberFormat)}
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
                  currency={activeCurrency}
                  numberFormat={numberFormat}
                  centerLabel={filter.kind === 'expense' ? 'Spent' : 'Received'}
                  total={totals.total}
                  selectedId={selectedCategory}
                  onSelect={setSelectedCategory}
                />
              </GlassCard>
            </View>

            {selectedCategoryObj && (
              <View style={styles.section}>
                <AppText variant="label" style={styles.sectionLabel}>
                  {selectedCategoryObj.name} breakdown
                </AppText>
                <GlassCard style={styles.chartCard} animateIndex={2}>
                  {subcategoryBreakdown.length === 0 ? (
                    <EmptyState
                      icon="pricetags-outline"
                      title="No subcategories here"
                      subtitle={`Add subcategories to ${selectedCategoryObj.name} from Manage Categories to see a breakdown.`}
                    />
                  ) : (
                    <View style={styles.subcatList}>
                      {subcategoryBreakdown.map(slice => (
                        <View key={slice.subcategory?.id ?? '__none__'} style={styles.subcatRow}>
                          <IconBadge
                            icon={slice.subcategory?.icon ?? 'ellipsis-horizontal'}
                            color={slice.subcategory?.color ?? Colors.textMuted}
                            size={32}
                          />
                          <View style={styles.subcatRowBody}>
                            <View style={styles.subcatRowHeader}>
                              <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                                {slice.subcategory?.name ?? 'No subcategory'}
                              </AppText>
                              <AppText variant="bodyStrong">
                                {formatCurrency(slice.amount, activeCurrency, numberFormat)}
                              </AppText>
                            </View>
                            <ProgressBar
                              progress={slice.share}
                              height={6}
                              color={slice.subcategory?.color ?? Colors.textMuted}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </GlassCard>
              </View>
            )}

            <View style={styles.section}>
              <AppText variant="label" style={styles.sectionLabel}>
                Daily activity
              </AppText>
              <GlassCard style={styles.chartCard} animateIndex={3}>
                <CalendarHeatmap
                  weeks={heatmapWeeks}
                  currency={activeCurrency}
                  numberFormat={numberFormat}
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
                        activeCurrency,
                        numberFormat
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
                <WeekdayBars buckets={weekdays} currency={activeCurrency} numberFormat={numberFormat} />
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
                      <AppText variant="amount">{formatCurrency(note.amount, activeCurrency, numberFormat)}</AppText>
                    </View>
                  ))}
                </GlassCard>
              </View>
            ) : null}
          </Animated.View>
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
    paddingTop: Spacing.md,
    paddingBottom: 150,
    gap: Spacing.lg,
  },
  kindWrap: {
    paddingHorizontal: 20,
  },
  summarySection: {
    paddingHorizontal: 20,
    gap: Spacing.sm,
  },
  currencyBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
  },
  refreshingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
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
  sections: {
    gap: Spacing.xl,
  },
  section: {
    paddingHorizontal: 20,
    gap: Spacing.sm,
  },
  sectionLabel: {
    marginLeft: 4,
  },
  heroCard: {
    gap: 4,
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  statRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    gap: 10,
  },
  stat: {
    flex: 1,
    gap: Spacing.xs,
  },
  chartCard: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 12,
  },
  selection: {
    alignItems: 'center',
    gap: 1,
  },
  subcatList: {
    gap: 16,
  },
  subcatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  subcatRowBody: {
    flex: 1,
    gap: 6,
  },
  subcatRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    gap: Spacing.xs,
  },
});
