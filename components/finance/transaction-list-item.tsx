import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconBadge } from '@/components/finance/icon-badge';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { Transaction } from '@/types/finance';
import { getAccountById, getCategoryById } from '@/utils/selectors';
import { formatCurrency } from '@/utils/currency';

export interface TransactionListItemProps {
  transaction: Transaction;
  onPress?: () => void;
}

export const TransactionListItem: React.FC<TransactionListItemProps> = ({ transaction, onPress }) => {
  const { colors } = useAppTheme();
  const { state } = useFinance();

  const category = getCategoryById(state, transaction.categoryId);
  const account = getAccountById(state, transaction.accountId);
  const toAccount = getAccountById(state, transaction.toAccountId);

  const isTransfer = transaction.type === 'transfer';
  const isIncome = transaction.type === 'income';

  const icon = isTransfer ? 'swap-horizontal' : category?.icon ?? 'ellipsis-horizontal-circle';
  const color = isTransfer ? colors.textSecondary : category?.color ?? colors.textMuted;

  const title = isTransfer
    ? `${account?.name ?? 'Account'} → ${toAccount?.name ?? 'Account'}`
    : category?.name ?? 'Uncategorized';

  const subtitle = isTransfer ? transaction.note || 'Transfer' : [account?.name, transaction.note].filter(Boolean).join(' · ');

  const amountColor = isTransfer ? colors.textPrimary : isIncome ? '#16A34A' : colors.textPrimary;
  const amountPrefix = isTransfer ? '' : isIncome ? '+' : '-';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <IconBadge icon={icon} color={color} size={42} />
      <View style={styles.textCol}>
        <AppText variant="body" weight="semibold" style={{ color: colors.textPrimary }} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <AppText variant="body" weight="bold" style={{ color: amountColor }}>
        {amountPrefix}
        {formatCurrency(transaction.amount, state.settings.currency)}
      </AppText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
});
