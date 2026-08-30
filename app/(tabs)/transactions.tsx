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
import { useTransactionPage } from '@/hooks/use-transaction-page';
import { useLedgerHeader } from '@/hooks/use-ledger-header';
import { GroupedTransactions, groupTransactionsByDay } from '@/utils/selectors';
import { dayLabel } from '@/utils/date';
import { formatCurrency } from '@/utils/currency';
import { Account, Category, NumberFormat, TransactionType } from '@/types/finance';
import { Colors, BorderRadius, ControlHeights, Spacing } from '@/constants/theme';

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
  const router = useRouter();
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
            currency={accountById.get(t.accountId)?.currency ?? currency}
            numberFormat={numberFormat}
            showDivider={i < group.transactions.length - 1}
            onPress={() => {
              if (t.splitCount && t.splitCount > 0) {
                router.push(`/split-detail?id=${t.id}` as any);
              } else if (t.splitExpenseId) {
                router.push(`/split-detail?id=${t.splitExpenseId}` as any);
              } else {
                onPressTransaction(t.id);
              }
            }}
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
   * results on screen while the new query is in flight, instead of
   * refiltering synchronously on every keystroke.
   */
  const deferredQuery = useDeferredValue(query);
  const needle = deferredQuery.trim().toLowerCase();

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

  // Category ids whose name matches the search needle — resolved once from
  // the small in-memory category list, then passed to the SQL query as an
  // IN(...) clause rather than fetching everything and filtering in JS.
  const matchingCategoryIds = useMemo(() => {
    if (!needle) return [];
    return state.categories.filter(c => c.name.toLowerCase().includes(needle)).map(c => c.id);
  }, [state.categories, needle]);

  const dbFilter = useMemo(
    () => ({
      type: filter === 'all' ? undefined : filter,
      search: needle ? { needle, categoryIds: matchingCategoryIds } : undefined,
    }),
    [filter, needle, matchingCategoryIds]
  );

  // Keyset-paginated: only ever holds the rows actually scrolled into view,
  // never the whole ledger. loadMore is wired to FlatList's onEndReached.
  const { rows, loading, loadMore, exhausted } = useTransactionPage(dbFilter, 60);
  const groups = useMemo(() => groupTransactionsByDay(rows), [rows]);

  const header = useLedgerHeader(filter, needle, matchingCategoryIds);

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
          {header.data.n}
          {exhausted ? '' : '+'} {header.data.n === 1 ? 'entry' : 'entries'} ·{' '}
          {formatCurrency(header.data.net, currency, numberFormat)} net
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

      {!isReady || (loading && groups.length === 0) ? (
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
          // Pages accumulate newest-first as the user scrolls, never loading
          // the whole ledger at once — this is the keyset pagination from
          // hooks/use-transaction-page.ts, not a slice of an in-memory array.
          onEndReached={() => loadMore()}
          onEndReachedThreshold={0.5}
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
    height: ControlHeights.md,
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
    height: 44,
    marginTop: 10,
    marginBottom: 2,
  },
  filterContent: {
    gap: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  chip: {
    height: ControlHeights.sm,
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
