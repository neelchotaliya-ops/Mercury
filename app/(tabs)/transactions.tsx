import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { TransactionListItem } from '@/components/finance/transaction-list-item';
import { EmptyState } from '@/components/finance/empty-state';
import { useFinance } from '@/context/finance-context';
import { groupTransactionsByDay, getCategoryById } from '@/utils/selectors';
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

export default function TransactionsScreen() {
  const router = useRouter();
  const { state } = useFinance();
  const [filter, setFilter] = useState<FilterType>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () =>
      state.transactions.filter(t => {
        if (filter !== 'all' && t.type !== filter) return false;
        if (query.trim().length > 0) {
          const category = getCategoryById(state, t.categoryId);
          const haystack = `${category?.name ?? ''} ${t.note ?? ''}`.toLowerCase();
          if (!haystack.includes(query.trim().toLowerCase())) return false;
        }
        return true;
      }),
    [state, filter, query]
  );

  const groups = useMemo(() => groupTransactionsByDay(filtered), [filtered]);
  const filteredTotal = filtered.reduce(
    (sum, t) => sum + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0),
    0
  );

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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {groups.length === 0 ? (
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
        ) : (
          groups.map((group, groupIndex) => (
            <View key={group.date} style={styles.group}>
              <AppText variant="label" style={styles.dayLabel}>
                {dayLabel(group.date)}
              </AppText>
              <GlassCard style={styles.groupCard} padding={18} animateIndex={groupIndex}>
                {group.transactions.map((t, index) => (
                  <TransactionListItem
                    key={t.id}
                    transaction={t}
                    showDivider={index < group.transactions.length - 1}
                    onPress={() => router.push(`/add-transaction?id=${t.id}`)}
                  />
                ))}
              </GlassCard>
            </View>
          ))
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
