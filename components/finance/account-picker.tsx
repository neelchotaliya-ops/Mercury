import React from 'react';
import { StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { Account } from '@/types/finance';
import { Colors, BorderRadius } from '@/constants/theme';

export interface AccountPickerProps {
  accounts: Account[];
  selectedId?: string;
  onSelect: (account: Account) => void;
  excludeId?: string;
}

export const AccountPicker: React.FC<AccountPickerProps> = ({
  accounts,
  selectedId,
  onSelect,
  excludeId,
}) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
    {accounts
      .filter(a => a.id !== excludeId)
      .map(account => {
        const selected = account.id === selectedId;
        return (
          <Pressable
            key={account.id}
            onPress={() => onSelect(account)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: selected ? Colors.ctaBg : Colors.controlBg,
                borderColor: selected ? 'transparent' : Colors.glassBorder,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Ionicons
              name={account.icon}
              size={16}
              color={selected ? Colors.ctaText : account.color}
            />
            <AppText variant="micro" color={selected ? Colors.ctaText : Colors.textPrimary}>
              {account.name}
            </AppText>
          </Pressable>
        );
      })}
  </ScrollView>
);

const styles = StyleSheet.create({
  row: {
    gap: 9,
    paddingVertical: 4,
    paddingRight: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
});
