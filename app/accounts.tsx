import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { AccountCard } from '@/components/finance/account-card';
import { EmptyState } from '@/components/finance/empty-state';
import { useFinance } from '@/context/finance-context';
import { useAccountBalances } from '@/hooks/use-account-balances';
import { formatCurrency } from '@/utils/currency';
import { Colors, BorderRadius, ControlHeights, Spacing } from '@/constants/theme';

export default function AccountsScreen() {
  const router = useRouter();
  const { state } = useFinance();

  // From account_balance/rollup, not a ledger scan.
  const { data: balanceMap } = useAccountBalances();

  const accounts = useMemo(
    () => state.accounts.filter(a => !a.archived),
    [state.accounts]
  );

  const currencyTotals = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const a of accounts) {
      const curr = a.currency ?? state.settings.currency ?? 'INR';
      const entry = map.get(curr) ?? { total: 0, count: 0 };
      entry.total += balanceMap.get(a.id) ?? 0;
      entry.count += 1;
      map.set(curr, entry);
    }
    return Array.from(map.entries()).map(([curr, data]) => ({
      currency: curr,
      total: data.total,
      count: data.count,
    }));
  }, [accounts, balanceMap, state.settings.currency]);

  return (
    <GradientScreen contours="top">
      <ModalHeader
        title="Accounts"
        onClose={() => router.back()}
        closeIcon="arrow-back"
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <GlassCard strong style={styles.netWorth} elevated>
          <AppText variant="label">Net worth</AppText>
          {currencyTotals.length <= 1 ? (
            <>
              <AppText variant="display" color={(currencyTotals[0]?.total ?? 0) < 0 ? Colors.expense : Colors.textPrimary}>
                {formatCurrency(currencyTotals[0]?.total ?? 0, currencyTotals[0]?.currency ?? state.settings.currency, state.settings.numberFormat)}
              </AppText>
              <AppText variant="caption">
                Across {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
              </AppText>
            </>
          ) : (
            <View style={styles.multiCurrencyTotals}>
              {currencyTotals.map(ct => (
                <View key={ct.currency} style={styles.currencyTotalRow}>
                  <AppText variant="h2" color={ct.total < 0 ? Colors.expense : Colors.textPrimary}>
                    {formatCurrency(ct.total, ct.currency, state.settings.numberFormat)}
                  </AppText>
                  <AppText variant="caption">
                    ({ct.count} {ct.count === 1 ? 'account' : 'accounts'})
                  </AppText>
                </View>
              ))}
            </View>
          )}
        </GlassCard>

        {accounts.length === 0 ? (
          <GlassCard>
            <EmptyState
              icon="wallet-outline"
              title="No accounts yet"
              subtitle="Add cash, a bank account, a card, or a wallet to track balances."
              actionLabel="Add account"
              onAction={() => router.push('/add-account')}
            />
          </GlassCard>
        ) : (
          <View style={styles.list}>
            {accounts.map((account, index) => (
              <AccountCard
                key={account.id}
                account={account}
                balance={balanceMap.get(account.id) ?? 0}
                currency={account.currency ?? state.settings.currency}
                numberFormat={state.settings.numberFormat}
                animateIndex={index}
                onPress={() => router.push(`/add-account?id=${account.id}`)}
              />
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <Pressable onPress={() => router.push('/add-account')} style={styles.actionTile}>
            <Ionicons name="add-circle-outline" size={19} color={Colors.textPrimary} />
            <AppText variant="micro" color={Colors.textPrimary}>
              Add account
            </AppText>
          </Pressable>

          {accounts.length >= 2 && (
            <Pressable
              onPress={() => router.push('/add-transaction?type=transfer')}
              style={styles.actionTile}
            >
              <Ionicons name="swap-horizontal" size={19} color={Colors.textPrimary} />
              <AppText variant="micro" color={Colors.textPrimary}>
                Transfer
              </AppText>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: Spacing.lg,
  },
  netWorth: {
    gap: 4,
    alignItems: 'flex-start',
  },
  multiCurrencyTotals: {
    gap: 6,
    marginTop: 4,
    width: '100%',
  },
  currencyTotalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  list: {
    gap: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: Spacing.xs,
  },
  actionTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: ControlHeights.lg,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.textMuted,
  },
});
