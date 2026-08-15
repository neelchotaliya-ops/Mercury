import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconBadge } from '@/components/finance/icon-badge';
import { useFinance } from '@/context/finance-context';
import { Transaction } from '@/types/finance';
import { getAccountById, getCategoryById } from '@/utils/selectors';
import { formatCurrency } from '@/utils/currency';
import { Colors } from '@/constants/theme';

export interface TransactionListItemProps {
  transaction: Transaction;
  onPress?: () => void;
  showDivider?: boolean;
}

export const TransactionListItem: React.FC<TransactionListItemProps> = ({
  transaction,
  onPress,
  showDivider = false,
}) => {
  const { state } = useFinance();

  const category = getCategoryById(state, transaction.categoryId);
  const account = getAccountById(state, transaction.accountId);
  const toAccount = getAccountById(state, transaction.toAccountId);

  const isTransfer = transaction.type === 'transfer';
  const isIncome = transaction.type === 'income';

  const icon = isTransfer ? 'swap-horizontal' : (category?.icon ?? 'ellipsis-horizontal');
  const color = isTransfer ? Colors.primary : (category?.color ?? Colors.textMuted);

  const title = isTransfer
    ? `${account?.name ?? 'Account'} → ${toAccount?.name ?? 'Account'}`
    : (category?.name ?? 'Uncategorized');

  const subtitle = isTransfer
    ? transaction.note || 'Transfer'
    : [account?.name, transaction.note].filter(Boolean).join(' · ');

  const amountColor = isIncome ? Colors.income : isTransfer ? Colors.textSecondary : Colors.textPrimary;
  const prefix = isTransfer ? '' : isIncome ? '+' : '−';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        showDivider && styles.divider,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <IconBadge icon={icon} color={color} size={42} />
      <View style={styles.textCol}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <AppText variant="amount" color={amountColor}>
        {prefix}
        {formatCurrency(transaction.amount, state.settings.currency)}
      </AppText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    gap: 13,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
});
