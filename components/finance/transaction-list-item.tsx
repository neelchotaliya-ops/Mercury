import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { IconBadge } from '@/components/finance/icon-badge';
import { Account, Category, NumberFormat, Transaction } from '@/types/finance';
import { formatCurrency } from '@/utils/currency';
import { Colors } from '@/constants/theme';

export interface TransactionListItemProps {
  transaction: Transaction;
  /** Pre-resolved category — pass undefined for uncategorised rows. */
  category: Category | undefined;
  /** Source account. */
  account: Account | undefined;
  /** Destination account for transfers. */
  toAccount: Account | undefined;
  currency: string;
  numberFormat?: NumberFormat;
  onPress?: () => void;
  showDivider?: boolean;
}

const TransactionListItemBase: React.FC<TransactionListItemProps> = ({
  transaction,
  category,
  account,
  toAccount,
  currency,
  numberFormat,
  onPress,
  showDivider = false,
}) => {
  const isTransfer = transaction.type === 'transfer';
  const isIncome = transaction.type === 'income';

  const icon = isTransfer ? 'swap-horizontal' : (category?.icon ?? 'ellipsis-horizontal');
  const color = isTransfer ? Colors.primary : (category?.color ?? Colors.textMuted);

  const title = isTransfer
    ? `${account?.name ?? 'Account'} → ${toAccount?.name ?? 'Account'}`
    : (transaction.payee || category?.name || 'Uncategorized');

  const subtitleParts = [
    account?.name,
    transaction.payee ? category?.name : undefined,
    transaction.note,
  ].filter(Boolean);

  const subtitle = isTransfer
    ? transaction.note || 'Transfer'
    : subtitleParts.join(' · ');

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
        <View style={styles.titleRow}>
          <AppText variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </AppText>
          {transaction.recurringRuleId && (
            <View style={styles.tagBadge}>
              <Ionicons name="repeat" size={10} color={Colors.primary} />
            </View>
          )}
          {transaction.splitExpenseId && (
            <View style={[styles.tagBadge, styles.splitTagBadge]}>
              <Ionicons name="people" size={10} color={Colors.income} />
            </View>
          )}
        </View>
        {subtitle ? (
          <AppText variant="caption" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <AppText variant="amount" color={amountColor} numberOfLines={1}>
        {prefix}
        {formatCurrency(transaction.amount, currency, numberFormat)}
      </AppText>
    </Pressable>
  );
};

/**
 * Memoized: only re-renders when its own props actually change.
 * Does NOT subscribe to FinanceContext — callers pass pre-resolved
 * category/account data, which breaks the chain of 250+ re-renders
 * on every state update.
 */
export const TransactionListItem = React.memo(TransactionListItemBase);

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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitTagBadge: {
    backgroundColor: Colors.incomeSoft,
  },
});
