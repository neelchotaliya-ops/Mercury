import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AccountCard } from '@/components/finance/account-card';
import { EmptyState } from '@/components/finance/empty-state';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { getTotalBalance } from '@/utils/selectors';
import { formatCurrency } from '@/utils/currency';

export default function AccountsScreen() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const { state } = useFinance();

  const activeAccounts = state.accounts.filter(a => !a.archived);
  const totalBalance = getTotalBalance(state);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.headerRow}>
        <AppText variant="h2" style={{ color: colors.textPrimary }}>
          Accounts
        </AppText>
        <Pressable onPress={() => router.push('/add-account')} style={[styles.addButton, { backgroundColor: colors.buttonPrimaryBg }]}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.totalRow}>
          <AppText variant="caption">Net worth</AppText>
          <AppText variant="h1" style={{ color: colors.textPrimary }}>
            {formatCurrency(totalBalance, state.settings.currency)}
          </AppText>
        </View>

        {activeAccounts.length === 0 ? (
          <EmptyState
            icon="wallet-outline"
            title="No accounts yet"
            subtitle="Add a cash, bank, card, or wallet account to start tracking your balances."
            actionLabel="Add account"
            onAction={() => router.push('/add-account')}
          />
        ) : (
          <View style={{ gap: spacing.md, marginTop: spacing.xl }}>
            {activeAccounts.map(account => (
              <AccountCard key={account.id} account={account} onPress={() => router.push(`/add-account?id=${account.id}`)} />
            ))}
          </View>
        )}

        {activeAccounts.length >= 2 && (
          <Pressable
            onPress={() => router.push('/add-transaction?type=transfer')}
            style={[styles.transferButton, { borderColor: colors.border }]}
          >
            <Ionicons name="swap-horizontal" size={18} color={colors.textPrimary} />
            <AppText variant="body" weight="semibold" style={{ color: colors.textPrimary }}>
              Transfer between accounts
            </AppText>
          </Pressable>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  totalRow: {
    marginBottom: 8,
  },
  transferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
