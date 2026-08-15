import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { GlassCard } from '@/components/ui/glass-card';
import { IconBadge } from '@/components/finance/icon-badge';
import { useFinance } from '@/context/finance-context';
import { Account } from '@/types/finance';
import { getAccountBalance } from '@/utils/selectors';
import { formatCurrency } from '@/utils/currency';
import { ACCOUNT_TYPE_META } from '@/constants/categories';
import { Colors } from '@/constants/theme';

export interface AccountCardProps {
  account: Account;
  onPress?: () => void;
  animateIndex?: number;
}

export const AccountCard: React.FC<AccountCardProps> = ({ account, onPress, animateIndex }) => {
  const { state } = useFinance();
  const balance = getAccountBalance(state, account.id);

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
              {formatCurrency(balance, state.settings.currency)}
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
