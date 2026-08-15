import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconBadge } from '@/components/finance/icon-badge';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { Account } from '@/types/finance';
import { getAccountBalance } from '@/utils/selectors';
import { formatCurrency } from '@/utils/currency';
import { ACCOUNT_TYPE_META } from '@/constants/categories';

export interface AccountCardProps {
  account: Account;
  onPress?: () => void;
}

export const AccountCard: React.FC<AccountCardProps> = ({ account, onPress }) => {
  const { colors, borderRadius, spacing } = useAppTheme();
  const { state } = useFinance();

  const balance = getAccountBalance(state, account.id);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.cardBorder,
          borderRadius: borderRadius.md,
          padding: spacing.lg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <IconBadge icon={account.icon} color={account.color} size={44} />
      <View style={styles.textCol}>
        <AppText variant="body" weight="semibold" style={{ color: colors.textPrimary }}>
          {account.name}
        </AppText>
        <AppText variant="caption">{ACCOUNT_TYPE_META[account.type].label}</AppText>
      </View>
      <AppText variant="h3" style={{ color: balance < 0 ? '#DC2626' : colors.textPrimary }}>
        {formatCurrency(balance, state.settings.currency)}
      </AppText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 14,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
});
