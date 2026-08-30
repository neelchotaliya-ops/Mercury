import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { OrganicHero, HeroBadge, BadgeSlot } from '@/components/ui/organic-hero';
import { StatCard } from '@/components/finance/stat-card';
import { TransactionListItem } from '@/components/finance/transaction-list-item';
import { EmptyState } from '@/components/finance/empty-state';
import { HomeSkeleton } from '@/components/finance/home-skeleton';
import { useFinance } from '@/context/finance-context';
import { useAccountBalances } from '@/hooks/use-account-balances';
import { useMonthSummary, useRecentTransactions } from '@/hooks/use-home-data';
import { useScreenReady } from '@/hooks/use-screen-ready';
import { formatCurrency } from '@/utils/currency';
import { toMonthKey } from '@/utils/date';
import { ACCOUNT_TYPE_META } from '@/constants/categories';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  // From account_balance/rollup, not a ledger scan — O(accounts), and
  // re-fetches only when a write anywhere bumps db/version.ts.
  const { data: balanceMap } = useAccountBalances();

  // Pre-built lookup maps so TransactionListItem rows never scan arrays.
  const categoryById = useMemo(
    () => new Map(state.categories.map(c => [c.id, c])),
    [state.categories]
  );
  const accountById = useMemo(
    () => new Map(state.accounts.map(a => [a.id, a])),
    [state.accounts]
  );

  const uniqueCurrencies = useMemo(() => {
    const list = Array.from(
      new Set(accounts.map(a => a.currency ?? state.settings.currency ?? 'INR'))
    );
    return list.length > 0 ? list : [state.settings.currency ?? 'INR'];
  }, [accounts, state.settings.currency]);

  const [selectedCurrency, setSelectedCurrency] = useState<string>(uniqueCurrencies[0] ?? 'INR');
  const activeCurrency = uniqueCurrencies.includes(selectedCurrency)
    ? selectedCurrency
    : (uniqueCurrencies[0] ?? 'INR');

  const currencyTotal = useMemo(() => {
    let total = 0;
    for (const account of accounts) {
      if ((account.currency ?? 'INR') === activeCurrency) {
        total += balanceMap.get(account.id) ?? 0;
      }
    }
    return total;
  }, [accounts, balanceMap, activeCurrency]);

  // Selected account
  const selectedAccount = useMemo(
    () => accounts.find(a => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  );

  // This month's income/expense for the selected account (or all), from the
  // rollup — a single indexed query instead of a filter+scan over the ledger.
  const { data: monthSummary } = useMonthSummary(monthKey, selectedAccountId);
  const income = monthSummary.income;
  const expense = monthSummary.expense;

  // Newest few transactions for the selected account (or all), queried
  // directly rather than sliced off a full in-memory array.
  const { data: recent } = useRecentTransactions(selectedAccountId, 5);

  const heroCurrency = selectedAccount ? (selectedAccount.currency ?? activeCurrency) : activeCurrency;
  const heroValue = formatCurrency(
    selectedAccount ? (balanceMap.get(selectedAccount.id) ?? 0) : currencyTotal,
    heroCurrency,
    numberFormat
  );
  const heroLabel = selectedAccount
    ? selectedAccount.name
    : uniqueCurrencies.length > 1
      ? `Total (${activeCurrency})`
      : 'Total balance';
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
        currency: account.currency ?? activeCurrency,
        numberFormat,
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
      balance: currencyTotal,
      currency: activeCurrency,
      numberFormat,
      icon: 'sparkles',
      color: Colors.primary,
      slot: slots[0],
      onPress: () => setSelectedAccountId(null),
    };

    const remainingBadges = remainingAccounts.slice(0, 3).map((account, idx) => ({
      id: account.id,
      name: account.name,
      balance: balanceMap.get(account.id) ?? 0,
      currency: account.currency ?? activeCurrency,
      numberFormat,
      icon: account.icon,
      color: account.color,
      slot: slots[idx + 1],
      onPress: () => setSelectedAccountId(account.id),
    }));

    return [totalBadge, ...remainingBadges];
  }, [accounts, selectedAccountId, balanceMap, currencyTotal, activeCurrency, numberFormat]);

  const isReady = useScreenReady(40);

  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      scrollY.value = event.contentOffset.y;
    },
  });

  /**
   * Smooth, synchronous 1:1 scroll responsiveness:
   * Moves precisely at finger speed with no animation delay or dual-step snapping.
   */
  const heroFadeStyle = useAnimatedStyle(() => {
    const y = scrollY.value;

    const opacity = interpolate(
      y,
      [0, 150],
      [1.0, 0.0],
      Extrapolation.CLAMP
    );

    const scale = interpolate(
      y,
      [-100, 0, 150],
      [1.12, 1.0, 0.92],
      Extrapolation.CLAMP
    );

    const translateY = interpolate(
      y,
      [-100, 0],
      [35, 0],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  return (
    <GradientScreen contours="top" edges={[]}>
      {/* Pinned top header with seamless feathering gradient */}
      <View style={[styles.headerWrapper, { paddingTop: insets.top + 8 }]}>
        <LinearGradient
          colors={['#EFE4FC', 'rgba(239, 228, 252, 0.96)', 'rgba(239, 228, 252, 0)']}
          locations={[0, 0.7, 1]}
          style={styles.headerGradient}
          pointerEvents="none"
        />
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
      </View>

      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 68 }]}
        showsVerticalScrollIndicator={false}
      >
        {!isReady ? (
          <HomeSkeleton />
        ) : (
          <>
            <Animated.View style={heroFadeStyle}>
              <OrganicHero
                label={heroLabel}
                value={heroValue}
                sub={heroSub}
                currency={heroCurrency}
                numberFormat={numberFormat}
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
            </Animated.View>

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
                        {formatCurrency(balanceMap.get(account.id) ?? 0, account.currency ?? currency, numberFormat)}
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
                      currency={accountById.get(t.accountId)?.currency ?? currency}
                      numberFormat={numberFormat}
                      showDivider={index < recent.length - 1}
                      onPress={() => router.push(`/add-transaction?id=${t.id}`)}
                    />
                  ))}
                </GlassCard>
              )}
            </View>
          </>
        )}
      </Animated.ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  headerWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 22,
    zIndex: 10,
  },
  headerGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 140,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
    marginTop: 8,
    marginBottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.pill,
    backgroundColor: `${Colors.primary}18`,
    borderWidth: 1,
    borderColor: `${Colors.primary}33`,
  },
  filterText: {
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  section: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountRow: {
    gap: Spacing.md,
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
    borderRadius: BorderRadius.xs,
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
