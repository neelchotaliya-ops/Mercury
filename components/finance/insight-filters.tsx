import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Colors, BorderRadius } from '@/constants/theme';
import { haptics } from '@/utils/haptics';
import { Account, Category } from '@/types/finance';
import {
  DateRangePreset,
  InsightFilter,
  RANGE_LABELS,
} from '@/utils/insights';

export interface InsightFiltersProps {
  filter: InsightFilter;
  accounts: Account[];
  categories: Category[];
  onChange: (next: InsightFilter) => void;
}

const RANGES: DateRangePreset[] = ['30d', '3m', '6m', '12m', 'ytd', 'all'];

interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  tint?: string;
}

const Chip: React.FC<ChipProps> = ({ label, active, onPress, tint }) => (
  <Pressable
    onPress={() => {
      haptics.toggle();
      onPress();
    }}
    style={[
      styles.chip,
      {
        backgroundColor: active ? tint ?? Colors.ctaBg : Colors.controlBg,
        borderColor: active ? 'transparent' : Colors.glassBorder,
      },
    ]}
  >
    <AppText variant="micro" color={active ? Colors.ctaText : Colors.textSecondary}>
      {label}
    </AppText>
  </Pressable>
);

/**
 * The filter row that every chart below reads from.
 *
 * Kept as one horizontal band above the charts rather than hidden behind a
 * modal: the current selection is itself information, and a filter you cannot
 * see is a filter you forget is applied.
 */
export const InsightFilters: React.FC<InsightFiltersProps> = ({
  filter,
  accounts,
  categories,
  onChange,
}) => {
  const toggle = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter(x => x !== id) : [...list, id];

  const liveAccounts = accounts.filter(a => !a.archived);
  const kindCategories = categories.filter(c => c.kind === filter.kind);

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {RANGES.map(range => (
          <Chip
            key={range}
            label={RANGE_LABELS[range]}
            active={filter.range === range}
            onPress={() => onChange({ ...filter, range })}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip
          label="All accounts"
          active={filter.accountIds.length === 0}
          onPress={() => onChange({ ...filter, accountIds: [] })}
        />
        {liveAccounts.map(account => (
          <Chip
            key={account.id}
            label={account.name}
            active={filter.accountIds.includes(account.id)}
            tint={account.color}
            onPress={() => onChange({ ...filter, accountIds: toggle(filter.accountIds, account.id) })}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip
          label="All categories"
          active={filter.categoryIds.length === 0}
          onPress={() => onChange({ ...filter, categoryIds: [] })}
        />
        {kindCategories.map(category => (
          <Chip
            key={category.id}
            label={category.name}
            active={filter.categoryIds.includes(category.id)}
            tint={category.color}
            onPress={() =>
              onChange({ ...filter, categoryIds: toggle(filter.categoryIds, category.id) })
            }
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  row: {
    gap: 8,
    paddingHorizontal: 20,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
});
