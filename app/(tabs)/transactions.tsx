import React, { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { TransactionListItem } from '@/components/finance/transaction-list-item';
import { TransactionsSkeleton } from '@/components/finance/transactions-skeleton';
import { EmptyState } from '@/components/finance/empty-state';
import { useScreenReady } from '@/hooks/use-screen-ready';
import { useFinance } from '@/context/finance-context';
import { GroupedTransactions, groupTransactionsByDay } from '@/utils/selectors';
import { dayLabel } from '@/utils/date';
import { formatCurrency } from '@/utils/currency';
import { Account, Category, TransactionType } from '@/types/finance';
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
  categoryById,
  accountById,
  currency,
  numberFormat,
  onPressTransaction,
}: {
  group: GroupedTransactions;
  index: number;
  categoryById: Map<string, Category>;
  accountById: Map<string, Account>;
  currency: string;
  numberFormat?: NumberFormat;
  onPressTransaction: (id: string) => void;
}) {
  return (
    <View style={styles.group}>
      <AppText variant="label" style={styles.dayLabel}>
        {dayLabel(group.date)}
      </AppText>
      {/* No mount entrance here on purpose: this row lives inside a FlatList,
          where Reanimated's web layout-animation shim has a real bug measuring
          rows as they mount/recycle during scroll (it reproducibly throws
          Cannot read properties of undefined (reading 'top')). Virtualized rows
          popping in individually as they scroll into view would also just look
          chaotic, so this is the right behaviour on native too, not only a web
          workaround. */}
      <GlassCard style={styles.groupCard} padding={18} animate={false}>
        {group.transactions.map((t, i) => (
          <TransactionListItem
            key={t.id}
            transaction={t}
            category={categoryById.get(t.categoryId ?? '')}
            account={accountById.get(t.accountId)}
            toAccount={t.toAccountId ? accountById.get(t.toAccountId) : undefined}
            currency={currency}
            numberFormat={numberFormat}
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
  const isReady = useScreenReady(180);

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

  /**
   * Full lookup maps for row rendering — separate from the name-only map
   * above so TransactionListItem gets the complete Category/Account objects
   * without scanning arrays per row.
   */
  const categoryById = useMemo(
    () => new Map(state.categories.map(c => [c.id, c])),
    [state.categories]
  );
  const accountById = useMemo(
    () => new Map(state.accounts.map(a => [a.id, a])),
    [state.accounts]
  );
  const currency = state.settings.currency;
  const numberFormat = state.settings.numberFormat;

  // Keyed on transactions rather than the whole state object, so unrelated
  // changes (settings, presets, budgets) no longer invalidate this.
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    // Fast path: when nothing is filtered, return state.transactions directly.
    // This preserves the reference identity so groupTransactionsByDay sees the
    // same pre-sorted array and its isSortedDesc check short-circuits instantly
    // — no O(n) copy and no O(n log n) sort on every render.
    if (filter === 'all' && needle.length === 0) return state.transactions;

    const out: typeof state.transactions = [];
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
        categoryById={categoryById}
        accountById={accountById}
        currency={currency}
        numberFormat={numberFormat}
        onPressTransaction={openTransaction}
      />
    ),
    [openTransaction, categoryById, accountById, currency, numberFormat]
  );

  const keyExtractor = useCallback((group: GroupedTransactions) => group.date, []);

  return (
    <GradientScreen>
      <View style={styles.header}>
        <AppText variant="h2">Activity</AppText>
        <AppText variant="caption">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} ·{' '}
          {formatCurrency(filteredTotal, currency, numberFormat)} net
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

      {!isReady ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <TransactionsSkeleton />
        </ScrollView>
      ) : (
        <FlatList
          data={groups}
          renderItem={renderGroup}
          keyExtractor={keyExtractor}
          style={styles.list}
          contentContainerStyle={[
            styles.content,
            groups.length === 0 && styles.emptyContent,
          ]}
          showsVerticalScrollIndicator={false}
        // state.transactions is kept sorted newest-first by the reducer, so
        // groups are also in order. These batch settings balance initial render
        // speed with smooth scroll for large ledgers (1000+ transactions).
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={25}
        windowSize={9}
        // removeClippedSubviews is intentionally omitted on Android: it causes
        // blank-frame jank when scrolling back to previously-detached views,
        // which is worse than the small memory saving it provides.
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
      )}

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
    marginTop: 10,
    paddingHorizontal: 14,
    height: 42,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  filterRow: {
    flexGrow: 0,
    flexShrink: 0,
    height: 40,
    marginTop: 10,
    marginBottom: 2,
  },
  filterContent: {
    gap: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  chip: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 130,
  },
  emptyContent: {
    paddingTop: 16,
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
