import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { Colors, BorderRadius } from '@/constants/theme';
import { useMountPop } from '@/hooks/use-mount-pop';
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

interface FilterPanelProps {
  filter: InsightFilter;
  liveAccounts: Account[];
  kindCategories: Category[];
  onChange: (next: InsightFilter) => void;
  toggle: (list: string[], id: string) => string[];
}

/**
 * Split out so `useMountPop` mounts fresh — and therefore pops in — every
 * time `expanded` flips true, rather than once for the lifetime of the
 * always-rendered parent.
 */
const FilterPanel: React.FC<FilterPanelProps> = ({
  filter,
  liveAccounts,
  kindCategories,
  onChange,
  toggle,
}) => {
  const mountStyle = useMountPop();

  return (
    <Animated.View exiting={FadeOut.duration(140)} style={[styles.panel, mountStyle]}>
      <AppText variant="micro" style={styles.panelLabel}>
        Accounts
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.panelRow}>
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

      <AppText variant="micro" style={styles.panelLabel}>
        Categories
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.panelRow}>
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
            onPress={() => onChange({ ...filter, categoryIds: toggle(filter.categoryIds, category.id) })}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
};

/**
 * Range, account and category filtering for the charts below.
 *
 * The range row stays permanently visible — it is the one control almost
 * every visit uses, and the current selection is itself information a hidden
 * filter would let you forget about. Account and category filtering are real
 * power-user tools used less often, so they sit behind a single "Filters"
 * toggle instead of two more always-on scrolling chip rows: closed, the
 * screen reads clean; opened, nothing is held back — the exact same chip
 * pickers as before, not a reduced version of them.
 */
export const InsightFilters: React.FC<InsightFiltersProps> = ({
  filter,
  accounts,
  categories,
  onChange,
}) => {
  const [expanded, setExpanded] = useState(false);

  const toggle = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter(x => x !== id) : [...list, id];

  const liveAccounts = accounts.filter(a => !a.archived);
  const kindCategories = categories.filter(c => c.kind === filter.kind);
  const activeCount = filter.accountIds.length + filter.categoryIds.length;
  const hasActiveFilters = activeCount > 0;

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

      <View style={styles.toggleRow}>
        <Pressable
          onPress={() => {
            haptics.toggle();
            setExpanded(v => !v);
          }}
          style={[styles.filterToggle, hasActiveFilters && styles.filterToggleActive]}
        >
          <Ionicons
            name="options-outline"
            size={14}
            color={hasActiveFilters ? Colors.ctaText : Colors.textSecondary}
          />
          <AppText
            variant="micro"
            color={hasActiveFilters ? Colors.ctaText : Colors.textSecondary}
          >
            {hasActiveFilters ? `Filters · ${activeCount}` : 'Filters'}
          </AppText>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={13}
            color={hasActiveFilters ? Colors.ctaText : Colors.textMuted}
          />
        </Pressable>

        {hasActiveFilters ? (
          <Pressable
            onPress={() => {
              haptics.selection();
              onChange({ ...filter, accountIds: [], categoryIds: [] });
            }}
            hitSlop={8}
            style={styles.clearBtn}
          >
            <AppText variant="micro" color={Colors.primaryDeep}>
              Clear
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {expanded ? (
        <FilterPanel
          filter={filter}
          liveAccounts={liveAccounts}
          kindCategories={kindCategories}
          onChange={onChange}
          toggle={toggle}
        />
      ) : null}
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: Colors.controlBg,
  },
  filterToggleActive: {
    backgroundColor: Colors.ctaBg,
    borderColor: 'transparent',
  },
  clearBtn: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  panel: {
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 20,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  panelLabel: {
    color: Colors.textMuted,
    marginLeft: 2,
  },
  panelRow: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
});
