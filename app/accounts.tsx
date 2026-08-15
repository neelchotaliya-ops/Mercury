import React from 'react';
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
import { getTotalBalance } from '@/utils/selectors';
import { formatCurrency } from '@/utils/currency';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

export default function AccountsScreen() {
  const router = useRouter();
  const { state } = useFinance();

  const accounts = state.accounts.filter(a => !a.archived);
  const totalBalance = getTotalBalance(state);

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
          <AppText variant="display" color={totalBalance < 0 ? Colors.expense : Colors.textPrimary}>
            {formatCurrency(totalBalance, state.settings.currency)}
          </AppText>
          <AppText variant="caption">
            Across {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          </AppText>
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
    paddingVertical: 15,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.textMuted,
  },
});
