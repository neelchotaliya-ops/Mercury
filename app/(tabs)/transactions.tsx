import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { TransactionListItem } from '@/components/finance/transaction-list-item';
import { EmptyState } from '@/components/finance/empty-state';
import { useFinance } from '@/context/finance-context';
import { GroupedTransactions, groupTransactionsByDay } from '@/utils/selectors';
import { dayLabel } from '@/utils/date';
import { formatCurrency } from '@/utils/currency';
import { TransactionType } from '@/types/finance';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

type FilterType = 'all' | TransactionType;

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expense', label: 'Spending' },
  { key: 'income', label: 'Income' },
  { key: 'transfer', label: 'Transfers' },
];

/**
 * One day's transactions. Memoized so scrolling only re-renders rows whose
 * data actually changed, rather than the whole list on every parent render.
 */
const DayGroup = React.memo(function DayGroup({
  group,
  index,
  onPressTransaction,
}: {
  group: GroupedTransactions;
  index: number;
  onPressTransaction: (id: string) => void;
}) {
  return (
    <View style={styles.group}>
      <AppText variant="label" style={styles.dayLabel}>
        {dayLabel(group.date)}
      </AppText>
      <GlassCard style={styles.groupCard} padding={18} animateIndex={index}>
        {group.transactions.map((t, i) => (
          <TransactionListItem
            key={t.id}
            transaction={t}
            showDivider={i < group.transactions.length - 1}
            onPress={() => onPressTransaction(t.id)}
          />
        ))}
      </GlassCard>
    </View>
  );
});

export default function TransactionsScreen() {
  const router = useRouter();
  const { state } = useFinance();
  const [filter, setFilter] = useState<FilterType>('all');
  const [query, setQuery] = useState('');

  /**
   * Search is deferred so typing stays responsive: React keeps the previous
   * results on screen while the new ones are computed, instead of refiltering
   * the whole ledger synchronously on every keystroke.
   */
  const deferredQuery = useDeferredValue(query);

  /**
   * Category names, resolved once. The filter below used to call
   * getCategoryById per transaction, which is a linear scan inside a linear
   * scan — O(transactions x categories) on every keystroke.
   */
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of state.categories) map.set(c.id, c.name.toLowerCase());
    return map;
  }, [state.categories]);

  // Keyed on transactions rather than the whole state object, so unrelated
  // changes (settings, presets, budgets) no longer invalidate this.
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const out = [];
    for (const t of state.transactions) {
      if (filter !== 'all' && t.type !== filter) continue;
      if (needle.length > 0) {
        const categoryName = t.categoryId ? categoryNameById.get(t.categoryId) ?? '' : '';
        const note = t.note ? t.note.toLowerCase() : '';
        if (!categoryName.includes(needle) && !note.includes(needle)) continue;
      }
      out.push(t);
    }
    return out;
  }, [state.transactions, categoryNameById, filter, deferredQuery]);

  const groups = useMemo(() => groupTransactionsByDay(filtered), [filtered]);

  const filteredTotal = useMemo(
    () =>
      filtered.reduce(
        (sum, t) => sum + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0),
        0
      ),
    [filtered]
  );

  const openTransaction = useCallback(
    (id: string) => router.push(`/add-transaction?id=${id}`),
    [router]
  );

  const renderGroup = useCallback(
    ({ item, index }: { item: GroupedTransactions; index: number }) => (
      <DayGroup
        group={item}
        index={index}
        onPressTransaction={openTransaction}
      />
    ),
    [openTransaction]
  );

  const keyExtractor = useCallback((group: GroupedTransactions) => group.date, []);

  return (
    <GradientScreen>
      <View style={styles.header}>
        <AppText variant="h2">Activity</AppText>
        <AppText variant="caption">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} ·{' '}
          {formatCurrency(filteredTotal, state.settings.currency)} net
        </AppText>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by category or note"
          placeholderTextColor={Colors.textMuted}
          style={styles.searchInput}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={Colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map(f => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? Colors.ctaBg : Colors.controlBg,
                  borderColor: active ? 'transparent' : Colors.glassBorder,
                },
              ]}
            >
              <AppText variant="micro" color={active ? Colors.ctaText : Colors.textSecondary}>
                {f.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={groups}
        renderItem={renderGroup}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        // The ledger grows without bound and every row used to be mounted at
        // once; these keep the mounted window small on low-end devices.
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={
          <GlassCard>
            <EmptyState
              icon="search-outline"
              title="No matches"
              subtitle={
                query.length > 0
                  ? 'Try a different search term or filter.'
                  : 'Transactions you add will show up here.'
              }
            />
          </GlassCard>
        }
      />

    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 3,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 20,
    marginTop: Spacing.lg,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  filterRow: {
    marginTop: 14,
    maxHeight: 42,
  },
  filterContent: {
    gap: 8,
    paddingHorizontal: 20,
  },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 130,
  },
  group: {
    marginBottom: Spacing.lg,
    gap: 9,
  },
  dayLabel: {
    marginLeft: 4,
  },
  groupCard: {
    paddingVertical: 4,
  },
});
