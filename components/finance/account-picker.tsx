import React from 'react';
import { StyleSheet, Pressable, ScrollView } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconBadge } from '@/components/finance/icon-badge';
import { useAppTheme } from '@/context/theme-context';
import { Account } from '@/types/finance';

export interface AccountPickerProps {
  accounts: Account[];
  selectedId?: string;
  onSelect: (account: Account) => void;
  excludeId?: string;
}

export const AccountPicker: React.FC<AccountPickerProps> = ({ accounts, selectedId, onSelect, excludeId }) => {
  const { colors, borderRadius } = useAppTheme();
  const visibleAccounts = accounts.filter(a => a.id !== excludeId);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {visibleAccounts.map(account => {
        const isSelected = account.id === selectedId;
        return (
          <Pressable
            key={account.id}
            onPress={() => onSelect(account)}
            style={[
              styles.chip,
              {
                borderRadius: borderRadius.pill,
                backgroundColor: isSelected ? colors.primary : colors.cardBackground,
                borderColor: isSelected ? colors.primary : colors.cardBorder,
              },
            ]}
          >
            <IconBadge icon={account.icon} color={isSelected ? '#FFFFFF' : account.color} size={24} />
            <AppText
              variant="body"
              weight="semibold"
              style={{ color: isSelected ? '#FFFFFF' : colors.textPrimary }}
            >
              {account.name}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: {
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
});
