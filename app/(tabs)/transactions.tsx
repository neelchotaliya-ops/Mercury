import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { TransactionListItem } from '@/components/finance/transaction-list-item';
import { EmptyState } from '@/components/finance/empty-state';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { groupTransactionsByDay, getCategoryById } from '@/utils/selectors';
import { dayLabel } from '@/utils/date';
import { TransactionType } from '@/types/finance';

type FilterType = 'all' | TransactionType;

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expense' },
  { key: 'transfer', label: 'Transfers' },
];

export default function TransactionsScreen() {
  const router = useRouter();
  const { colors, spacing, borderRadius } = useAppTheme();
  const { state } = useFinance();
  const [filter, setFilter] = useState<FilterType>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return state.transactions.filter(t => {
      if (filter !== 'all' && t.type !== filter) return false;
      if (query.trim().length > 0) {
        const category = getCategoryById(state, t.categoryId);
        const haystack = `${category?.name ?? ''} ${t.note ?? ''}`.toLowerCase();
        if (!haystack.includes(query.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [state, filter, query]);

  const groups = useMemo(() => groupTransactionsByDay(filtered), [filtered]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.headerRow}>
        <AppText variant="h2" style={{ color: colors.textPrimary }}>
          Transactions
        </AppText>
      </View>

      <View
        style={[
          styles.searchBar,
          { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder, borderRadius: borderRadius.pill },
        ]}
      >
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search transactions"
          placeholderTextColor={colors.textMuted}
          style={[styles.searchInput, { color: colors.textPrimary }]}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 8 }}>
        {FILTERS.map(f => {
          const isActive = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.filterChip,
                {
                  borderRadius: borderRadius.pill,
                  backgroundColor: isActive ? colors.buttonPrimaryBg : colors.cardBackground,
                  borderColor: isActive ? colors.buttonPrimaryBg : colors.cardBorder,
                },
              ]}
            >
              <AppText variant="body" weight="semibold" style={{ color: isActive ? '#FFFFFF' : colors.textPrimary }}>
                {f.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {groups.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No transactions found"
            subtitle="Try a different filter or add a new transaction."
            actionLabel="Add transaction"
            onAction={() => router.push('/add-transaction')}
          />
        ) : (
          groups.map(group => (
            <View key={group.date} style={{ marginBottom: spacing.lg }}>
              <AppText variant="caption" style={styles.dayLabel}>
                {dayLabel(group.date)}
              </AppText>
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
                ]}
              >
                {group.transactions.map(t => (
                  <TransactionListItem key={t.id} transaction={t} onPress={() => router.push(`/add-transaction?id=${t.id}`)} />
                ))}
              </View>
            </View>
          ))
        )}
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
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  filterRow: {
    marginTop: 12,
    paddingHorizontal: 20,
    maxHeight: 44,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  dayLabel: {
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
});
