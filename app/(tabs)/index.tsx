import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { OrganicHero, HeroBadge, BadgeSlot } from '@/components/ui/organic-hero';
import { StatCard } from '@/components/finance/stat-card';
import { TransactionListItem } from '@/components/finance/transaction-list-item';
import { EmptyState } from '@/components/finance/empty-state';
import { useFinance } from '@/context/finance-context';
import { getAllAccountBalances } from '@/utils/selectors';
import { formatCurrency } from '@/utils/currency';
import { toMonthKey, monthKeyOf } from '@/utils/date';
import { ACCOUNT_TYPE_META } from '@/constants/categories';
import { Colors, BorderRadius } from '@/constants/theme';

export default function HomeScreen() {
  const router = useRouter();
  const { state } = useFinance();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const monthKey = toMonthKey(new Date());
  const currency = state.settings.currency;
  const numberFormat = state.settings.numberFormat;

  // Stable filtered accounts list.
  const accounts = useMemo(
    () => state.accounts.filter(a => !a.archived),
    [state.accounts]
  );

  // Single O(n) pass over all transactions — reused for every balance read
  // on this screen. Previously getAccountBalance() was called once per badge
  // and once per chip, which was O(accounts × transactions) per render.
  const balanceMap = useMemo(
    () => getAllAccountBalances(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.transactions, state.accounts]
  );

  // Pre-built lookup maps so TransactionListItem rows never scan arrays.
  const categoryById = useMemo(
    () => new Map(state.categories.map(c => [c.id, c])),
    [state.categories]
  );
  const accountById = useMemo(
    () => new Map(state.accounts.map(a => [a.id, a])),
    [state.accounts]
  );

  const totalBalance = useMemo(() => {
    let total = 0;
    for (const account of accounts) total += balanceMap.get(account.id) ?? 0;
    return total;
  }, [accounts, balanceMap]);

  // Selected account
  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  );

  // Calculate filtered transactions for the selected account (or all)
  const filteredTransactions = useMemo(() => {
    if (!selectedAccountId) return state.transactions;
    return state.transactions.filter(
      t => t.accountId === selectedAccountId || t.toAccountId === selectedAccountId
    );
  }, [state.transactions, selectedAccountId]);

  // Calculate stats for current month for selected account / total
  const { income, expense } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    filteredTransactions.forEach(t => {
      // monthKeyOf, not `date.startsWith(monthKey)`: dates are stored as UTC
      // ISO strings, so a prefix compare buckets by UTC month. East of UTC a
      // transaction logged just after local midnight on the 1st carries the
      // previous UTC month and would be counted against the wrong month.
      if (monthKeyOf(t.date) === monthKey) {
        if (t.type === 'income') inc += t.amount;
        if (t.type === 'expense') exp += t.amount;
      }
    });
    return { income: inc, expense: exp };
  }, [filteredTransactions, monthKey]);

  const heroValue = formatCurrency(
    selectedAccount ? (balanceMap.get(selectedAccount.id) ?? 0) : totalBalance,
    currency,
    numberFormat
  );
  const heroLabel = selectedAccount ? selectedAccount.name : 'Total balance';
  const heroSub = selectedAccount
    ? `${ACCOUNT_TYPE_META[selectedAccount.type].label} Account · Tap to reset`
    : `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`;

  // Orbit badges:
  // If selectedAccountId === null:
  //   Slot 0-3: Accounts 0-3
  // If selectedAccountId === 'acc_id':
  //   Slot 0: Total Balance (id: null, name: 'Total balance', icon: 'sparkles', balance: totalBalance)
  //   Slot 1-3: Remaining 3 accounts
  const orbitBadges = useMemo(() => {
    const slots: BadgeSlot[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

    if (!selectedAccountId) {
      return accounts.slice(0, 4).map((account, idx) => ({
        id: account.id,
        name: account.name,
        balance: balanceMap.get(account.id) ?? 0,
        icon: account.icon,
        color: account.color,
        slot: slots[idx],
        onPress: () => setSelectedAccountId(account.id),
      }));
    }

    const remainingAccounts = accounts.filter(a => a.id !== selectedAccountId);

    const totalBadge: HeroBadge = {
      id: null,
      name: 'Total balance',
      balance: totalBalance,
      icon: 'sparkles',
      color: Colors.primary,
      slot: slots[0],
      onPress: () => setSelectedAccountId(null),
    };

    const remainingBadges = remainingAccounts.slice(0, 3).map((account, idx) => ({
      id: account.id,
      name: account.name,
      balance: balanceMap.get(account.id) ?? 0,
      icon: account.icon,
      color: account.color,
      slot: slots[idx + 1],
      onPress: () => setSelectedAccountId(account.id),
    }));

    return [totalBadge, ...remainingBadges];
  }, [accounts, selectedAccountId, balanceMap, totalBalance]);

  // state.transactions is kept sorted newest-first by the reducer and
  // filteredTransactions preserves that order, so just slice — no copy+sort
  // of 1,000 items needed to find the top 4.
  const recent = useMemo(
    () => filteredTransactions.slice(0, 4),
    [filteredTransactions]
  );

  return (
    <GradientScreen contours="top">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <AppText variant="h2" style={styles.brandTitle}>
              Mercury
            </AppText>
            <AppText variant="caption">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </AppText>
          </View>
          <IconButton iconName="settings-outline" onPress={() => router.push('/settings')} />
        </View>

        <OrganicHero
          label={heroLabel}
          value={heroValue}
          sub={heroSub}
          currency={currency}
          badges={orbitBadges}
          onPressMain={() => setSelectedAccountId(null)}
        />

        {selectedAccount ? (
          <Pressable onPress={() => setSelectedAccountId(null)} style={styles.filterChip}>
            <Ionicons name="filter" size={13} color={Colors.primary} />
            <AppText variant="micro" color={Colors.primary} style={styles.filterText}>
              Filtered by {selectedAccount.name}
            </AppText>
            <Ionicons name="close-circle" size={14} color={Colors.primary} />
          </Pressable>
        ) : null}

        <View style={styles.statsRow}>
          <StatCard
            label="Income"
            value={formatCurrency(income, currency, numberFormat)}
            icon="arrow-down"
            tint={Colors.income}
            animateIndex={0}
          />
          <StatCard
            label="Spent"
            value={formatCurrency(expense, currency, numberFormat)}
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
                <GlassCard style={styles.accountChip} padding={16} radius={BorderRadius.md} animateIndex={index}>
                  <View style={styles.accountChipHeader}>
                    <View style={[styles.accountBadge, { backgroundColor: `${account.color}22` }]}>
                      <Ionicons name={account.icon as any} size={14} color={account.color} />
                    </View>
                    <AppText variant="micro" numberOfLines={1} style={styles.accountName}>
                      {account.name}
                    </AppText>
                  </View>
                  <AppText
                    variant="h3"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    color={(balanceMap.get(account.id) ?? 0) < 0 ? Colors.expense : Colors.textPrimary}
                    style={styles.accountValue}
                  >
                    {formatCurrency(balanceMap.get(account.id) ?? 0, currency, numberFormat)}
                  </AppText>
                </GlassCard>
              </Pressable>
            ))}

            <Pressable
              onPress={() => router.push('/add-account')}
              style={({ pressed }) => [{ opacity: pressed ? 0.75 : 1 }]}
            >
              <GlassCard style={styles.addAccountChip} padding={16} radius={BorderRadius.md}>
                <Ionicons name="add" size={22} color={Colors.textSecondary} />
                <AppText variant="micro" color={Colors.textSecondary}>
                  Add
                </AppText>
              </GlassCard>
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
                  category={categoryById.get(t.categoryId ?? '')}
                  account={accountById.get(t.accountId)}
                  toAccount={t.toAccountId ? accountById.get(t.toAccountId) : undefined}
                  currency={currency}
                  numberFormat={numberFormat}
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
    paddingTop: 4,
    paddingBottom: 110,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
    marginBottom: 6,
  },
  headerText: {
    gap: 2,
  },
  brandTitle: {
    fontSize: 25,
    letterSpacing: -0.6,
  },
  filterChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    marginBottom: -8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: `${Colors.primary}18`,
    borderWidth: 1,
    borderColor: `${Colors.primary}33`,
  },
  filterText: {
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 26,
  },
  section: {
    marginTop: 18,
    gap: 8,
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
    width: 144,
    height: 94,
    justifyContent: 'space-between',
  },
  accountChipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accountBadge: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountName: {
    flex: 1,
  },
  accountValue: {
    marginTop: 2,
  },
  addAccountChip: {
    width: 90,
    height: 94,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderStyle: 'dashed',
    borderColor: Colors.textMuted,
  },
  listCard: {
    paddingVertical: 4,
  },
});
