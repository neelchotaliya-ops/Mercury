import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { BudgetProgressBarItem } from '@/components/finance/budget-progress-bar';
import { EmptyState } from '@/components/finance/empty-state';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { getBudgetProgress } from '@/utils/selectors';
import { monthKeyLabel, shiftMonthKey, toMonthKey } from '@/utils/date';

export default function BudgetsScreen() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const { state } = useFinance();
  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()));

  const progress = useMemo(() => getBudgetProgress(state, monthKey), [state, monthKey]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.headerRow}>
        <AppText variant="h2" style={{ color: colors.textPrimary }}>
          Budgets
        </AppText>
        <Pressable onPress={() => router.push('/add-budget')} style={[styles.addButton, { backgroundColor: colors.buttonPrimaryBg }]}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.monthRow}>
        <Pressable onPress={() => setMonthKey(k => shiftMonthKey(k, -1))} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="body" weight="semibold" style={{ color: colors.textPrimary }}>
          {monthKeyLabel(monthKey)}
        </AppText>
        <Pressable onPress={() => setMonthKey(k => shiftMonthKey(k, 1))} hitSlop={10}>
          <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {progress.length === 0 ? (
          <EmptyState
            icon="pie-chart-outline"
            title="No budgets yet"
            subtitle="Set a monthly spending limit for a category to start tracking your budget."
            actionLabel="Create budget"
            onAction={() => router.push('/add-budget')}
          />
        ) : (
          <View style={{ gap: spacing.md }}>
            {progress.map(p => (
              <BudgetProgressBarItem
                key={p.budget.id}
                progress={p}
                onPress={() => router.push(`/add-budget?id=${p.budget.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
});
