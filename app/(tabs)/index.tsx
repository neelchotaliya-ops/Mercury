import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { StatCard } from '@/components/finance/stat-card';
import { TransactionListItem } from '@/components/finance/transaction-list-item';
import { EmptyState } from '@/components/finance/empty-state';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { getMonthlyTotals, getTotalBalance } from '@/utils/selectors';
import { formatCurrency } from '@/utils/currency';
import { toMonthKey } from '@/utils/date';

export default function HomeScreen() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const { state } = useFinance();

  const monthKey = toMonthKey(new Date());
  const totalBalance = getTotalBalance(state);
  const { income, expense } = getMonthlyTotals(state, monthKey);

  const recentTransactions = [...state.transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <AppText variant="caption">Total balance</AppText>
            <AppText variant="h1" style={{ color: colors.textPrimary }}>
              {formatCurrency(totalBalance, state.settings.currency)}
            </AppText>
          </View>
          <IconButton
            iconName="settings-outline"
            onPress={() => router.push('/settings')}
            size={44}
            iconSize={20}
            color={colors.textPrimary}
            backgroundColor={colors.cardBackground}
          />
        </View>

        <View style={[styles.statsRow, { marginTop: spacing.xl }]}>
          <StatCard label="Income this month" value={formatCurrency(income, state.settings.currency)} icon="arrow-down-circle" tint="#16A34A" />
          <StatCard label="Expense this month" value={formatCurrency(expense, state.settings.currency)} icon="arrow-up-circle" tint="#DC2626" />
        </View>

        <View style={[styles.section, { marginTop: spacing['2xl'] }]}>
          <View style={styles.sectionHeader}>
            <AppText variant="h3" style={{ color: colors.textPrimary }}>
              Recent transactions
            </AppText>
            <Pressable onPress={() => router.push('/(tabs)/transactions')}>
              <AppText variant="link">See all</AppText>
            </Pressable>
          </View>

          {recentTransactions.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="No transactions yet"
              subtitle="Add your first transaction to start tracking your spending."
              actionLabel="Add transaction"
              onAction={() => router.push('/add-transaction')}
            />
          ) : (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
              ]}
            >
              {recentTransactions.map(t => (
                <TransactionListItem key={t.id} transaction={t} onPress={() => router.push(`/add-transaction?id=${t.id}`)} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Pressable
        onPress={() => router.push('/add-transaction')}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.buttonPrimaryBg, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
});
