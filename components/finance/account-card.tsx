import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { GlassCard } from '@/components/ui/glass-card';
import { IconBadge } from '@/components/finance/icon-badge';
import { Account } from '@/types/finance';
import { formatCurrency } from '@/utils/currency';
import { ACCOUNT_TYPE_META } from '@/constants/categories';
import { Colors } from '@/constants/theme';

export interface AccountCardProps {
  account: Account;
  /**
   * Passed in rather than derived here on purpose. This card used to call
   * `useFinance()` and run `getAccountBalance` itself, which is a full scan of
   * every transaction — once per card, on every render, unmemoized. A screen
   * with N accounts therefore cost O(accounts x transactions) per render. The
   * parent now computes every balance in a single pass and hands each card its
   * number, which also makes this component purely presentational.
   */
  balance: number;
  currency: string;
  onPress?: () => void;
  animateIndex?: number;
}

export const AccountCard: React.FC<AccountCardProps> = ({
  account,
  balance,
  currency,
  onPress,
  animateIndex,
}) => {
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <GlassCard
          style={[styles.card, { opacity: pressed ? 0.82 : 1 }]}
          padding={18}
          animateIndex={animateIndex}
        >
          <IconBadge icon={account.icon} color={account.color} size={46} />
          <View style={styles.textCol}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {account.name}
            </AppText>
            <AppText variant="caption">{ACCOUNT_TYPE_META[account.type].label}</AppText>
          </View>
          <View style={styles.amountCol}>
            <AppText
              variant="h3"
              color={balance < 0 ? Colors.expense : Colors.textPrimary}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {formatCurrency(balance, currency)}
            </AppText>
            <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} />
          </View>
        </GlassCard>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 76,
    gap: 14,
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  amountCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
