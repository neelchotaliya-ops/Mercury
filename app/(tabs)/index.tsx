import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { OrganicHero } from '@/components/ui/organic-hero';
import { StatCard } from '@/components/finance/stat-card';
import { TransactionListItem } from '@/components/finance/transaction-list-item';
import { EmptyState } from '@/components/finance/empty-state';
import { useFinance } from '@/context/finance-context';
import { getAccountBalance, getMonthlyTotals, getTotalBalance } from '@/utils/selectors';
import { formatCurrency } from '@/utils/currency';
import { toMonthKey } from '@/utils/date';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const router = useRouter();
  const { state } = useFinance();

  const monthKey = toMonthKey(new Date());
  const currency = state.settings.currency;
  const totalBalance = getTotalBalance(state);
  const { income, expense } = getMonthlyTotals(state, monthKey);

  const accounts = state.accounts.filter(a => !a.archived);
  const recent = [...state.transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);

  return (
    <GradientScreen contours="top">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText variant="caption">{greeting()}</AppText>
            <AppText variant="h2">Your money</AppText>
          </View>
          <IconButton iconName="settings-outline" onPress={() => router.push('/settings')} />
        </View>

        <OrganicHero
          label="Total balance"
          value={formatCurrency(totalBalance, currency)}
          sub={`${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`}
          badges={[
            { icon: 'trending-up', slot: 'topLeft', color: Colors.income },
            { icon: 'sparkles', slot: 'topRight', color: Colors.primary },
            { icon: 'card-outline', slot: 'bottomLeft', color: Colors.primary },
            { icon: 'trending-down', slot: 'bottomRight', color: Colors.expense },
          ]}
        />

        <View style={styles.statsRow}>
          <StatCard
            label="Income"
            value={formatCurrency(income, currency)}
            icon="arrow-down"
            tint={Colors.income}
            animateIndex={0}
          />
          <StatCard
            label="Spent"
            value={formatCurrency(expense, currency)}
            icon="arrow-up"
            tint={Colors.expense}
            animateIndex={1}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="label">Accounts</AppText>
            <Pressable onPress={() => router.push('/accounts')} hitSlop={8}>
              <AppText variant="link">Manage</AppText>
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountRow}>
            {accounts.map((account, index) => (
              <Pressable key={account.id} onPress={() => router.push('/accounts')}>
                <GlassCard style={styles.accountChip} padding={14} radius={BorderRadius.md} animateIndex={index}>
                  <View style={[styles.accountDot, { backgroundColor: account.color }]} />
                  <AppText variant="micro" numberOfLines={1}>
                    {account.name}
                  </AppText>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {formatCurrency(getAccountBalance(state, account.id), currency)}
                  </AppText>
                </GlassCard>
              </Pressable>
            ))}

            <Pressable onPress={() => router.push('/add-account')}>
              <View style={styles.addAccountChip}>
                <Ionicons name="add" size={20} color={Colors.textSecondary} />
                <AppText variant="micro">Add</AppText>
              </View>
            </Pressable>
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="label">Recent activity</AppText>
            <Pressable onPress={() => router.push('/(tabs)/transactions')} hitSlop={8}>
              <AppText variant="link">See all</AppText>
            </Pressable>
          </View>

          {recent.length === 0 ? (
            <GlassCard>
              <EmptyState
                icon="receipt-outline"
                title="Nothing here yet"
                subtitle="Tap the + button below to log your first transaction."
              />
            </GlassCard>
          ) : (
            <GlassCard style={styles.listCard} padding={18}>
              {recent.map((t, index) => (
                <TransactionListItem
                  key={t.id}
                  transaction={t}
                  showDivider={index < recent.length - 1}
                  onPress={() => router.push(`/add-transaction?id=${t.id}`)}
                />
              ))}
            </GlassCard>
          )}
        </View>
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 130,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    gap: 3,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: Spacing.xs,
  },
  section: {
    marginTop: Spacing['2xl'],
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountRow: {
    gap: 12,
    paddingVertical: 2,
    paddingRight: 8,
  },
  accountChip: {
    width: 138,
    height: 96,
    justifyContent: 'center',
    gap: 5,
  },
  accountDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginBottom: 2,
  },
  addAccountChip: {
    width: 92,
    height: 96,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  listCard: {
    paddingVertical: 4,
  },
});
