import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { IconBadge } from '@/components/finance/icon-badge';
import { Account, Category, NumberFormat, Transaction } from '@/types/finance';
import { formatCurrency } from '@/utils/currency';
import { Colors, BorderRadius } from '@/constants/theme';

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
  const isSplitExpense = Boolean(transaction.splitCount && transaction.splitCount > 0);
  const isSplitRepayment = Boolean(transaction.splitExpenseId);

  const splitCount = transaction.splitCount ?? 0;
  const splitPendingCount = transaction.splitPendingCount ?? 0;
  const totalOwed = transaction.splitOwedAmount ?? 0;
  const totalPaid = transaction.splitPaidAmount ?? 0;
  const remainingOwed = Math.max(0, totalOwed - totalPaid);

  const isFullySettled = isSplitExpense && splitCount > 0 && splitPendingCount === 0;

  const progressRatio = totalOwed > 0
    ? Math.min(1, Math.max(0, totalPaid / totalOwed))
    : splitCount > 0
    ? Math.max(0, splitCount - splitPendingCount) / splitCount
    : 0;

  // Icon & color
  const icon = isTransfer
    ? 'swap-horizontal'
    : isSplitRepayment
    ? 'arrow-down'
    : (category?.icon ?? (isSplitExpense ? 'people' : 'ellipsis-horizontal'));

  const color = isTransfer
    ? Colors.primary
    : isSplitRepayment
    ? Colors.income
    : (category?.color ?? (isSplitExpense ? Colors.primary : Colors.textMuted));

  // Title
  const title = isTransfer
    ? `${account?.name ?? 'Account'} → ${toAccount?.name ?? 'Account'}`
    : isSplitRepayment
    ? (transaction.payee || transaction.note || 'Repayment')
    : (transaction.payee || category?.name || 'Uncategorized');

  // Subtitle
  const originalBillLabel =
    transaction.splitOriginalPayee ||
    transaction.splitOriginalNote ||
    transaction.splitOriginalCategoryName;
  let subtitle: string;
  if (isTransfer) {
    subtitle = transaction.note || 'Transfer';
  } else if (isSplitRepayment) {
    const billText = originalBillLabel ? `For "${originalBillLabel}"` : 'Split repayment';
    const amountText = transaction.splitOriginalAmount
      ? ` (${formatCurrency(transaction.splitOriginalAmount, currency, numberFormat)} bill)`
      : '';
    const accountText = account?.name ? ` · ${account.name}` : '';
    subtitle = `${billText}${amountText}${accountText}`;
  } else if (isSplitExpense) {
    subtitle = `Split with ${splitCount} ${splitCount === 1 ? 'person' : 'people'}${
      account?.name ? ` · ${account.name}` : ''
    }`;
  } else {
    subtitle = [account?.name, transaction.payee ? category?.name : undefined, transaction.note]
      .filter(Boolean)
      .join(' · ');
  }

  const amountColor = isIncome ? Colors.income : isTransfer ? Colors.textSecondary : Colors.textPrimary;
  const prefix = isTransfer ? '' : isIncome ? '+' : '−';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        showDivider && styles.divider,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={styles.mainRow}>
        <IconBadge icon={icon} color={color} size={42} />

        <View style={styles.textCol}>
          <View style={styles.titleRow}>
            <AppText variant="bodyStrong" numberOfLines={1} style={styles.titleText}>
              {title}
            </AppText>
            {transaction.recurringRuleId && (
              <View style={styles.recurringBadge}>
                <Ionicons name="repeat" size={10} color={Colors.primary} />
              </View>
            )}
          </View>

          <AppText variant="caption" numberOfLines={1} color={Colors.textSecondary}>
            {subtitle}
          </AppText>
        </View>

        <View style={styles.amountCol}>
          <AppText variant="amount" color={amountColor} numberOfLines={1}>
            {prefix}
            {formatCurrency(transaction.amount, currency, numberFormat)}
          </AppText>

          {/* Clean status subtext under amount */}
          {isSplitExpense ? (
            <AppText
              variant="micro"
              color={isFullySettled ? Colors.income : Colors.primaryDeep}
              style={styles.subAmountText}
            >
              {isFullySettled
                ? '✓ Settled'
                : `${formatCurrency(remainingOwed, currency, numberFormat)} left`}
            </AppText>
          ) : isSplitRepayment ? (
            <AppText variant="micro" color={Colors.income} style={styles.subAmountText}>
              Settlement
            </AppText>
          ) : null}
        </View>
      </View>

      {/* Clean, spacious progress track for split expenses */}
      {isSplitExpense && splitCount > 0 && (
        <View style={styles.progressTrackContainer}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.round(progressRatio * 100)}%`,
                  backgroundColor: isFullySettled ? Colors.income : Colors.primary,
                },
              ]}
            />
          </View>
        </View>
      )}
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
  container: {
    paddingVertical: 14,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  textCol: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleText: {
    flexShrink: 1,
  },
  recurringBadge: {
    width: 18,
    height: 18,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
  },
  subAmountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressTrackContainer: {
    marginTop: 10,
    paddingLeft: 56, // Aligns cleanly under textCol (42 icon + 14 gap)
  },
  progressTrack: {
    height: 3.5,
    borderRadius: 2,
    backgroundColor: 'rgba(25, 21, 39, 0.07)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});









