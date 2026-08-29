import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GlassCard } from '@/components/ui/glass-card';
import { IconBadge } from '@/components/finance/icon-badge';
import { RecurringInsights } from '@/db/insights';
import { useFinance } from '@/context/finance-context';
import { formatCurrency } from '@/utils/currency';
import { describeFrequency } from '@/utils/recurring-engine';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { haptics } from '@/utils/haptics';

interface RecurringInsightsViewProps {
  insights: RecurringInsights | null;
}

export function RecurringInsightsView({ insights }: RecurringInsightsViewProps) {
  const router = useRouter();
  const { state } = useFinance();
  const currency = state.settings.currency ?? 'INR';

  if (!insights || insights.activeCount === 0) {
    return (
      <GlassCard padding={24} style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <Ionicons name="repeat-outline" size={32} color={Colors.primary} />
        </View>
        <AppText variant="h3" style={{ marginTop: 12 }}>
          No Recurring Payments
        </AppText>
        <AppText variant="body" color={Colors.textSecondary} style={{ textAlign: 'center', marginTop: 6 }}>
          Track subscriptions, rent, insurance, and bills with automatic logging and reminders.
        </AppText>
        <AppButton
          title="+ Add Recurring Payment"
          size="md"
          onPress={() => {
            haptics.press();
            router.push('/add-recurring' as any);
          }}
          style={{ marginTop: 18 }}
        />
      </GlassCard>
    );
  }

  return (
    <View style={styles.container}>
      {/* Commitment overview card */}
      <GlassCard padding={18} strong elevated style={styles.heroCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <AppText variant="caption" color={Colors.textSecondary}>Monthly Commitment</AppText>
            <AppText variant="h1" color={Colors.primaryDeep} style={{ marginTop: 2 }}>
              {formatCurrency(insights.monthlyTotal, currency)}
            </AppText>
            <AppText variant="caption" color={Colors.textMuted} style={{ marginTop: 2 }}>
              ~{formatCurrency(insights.yearlyTotal, currency)} per year
            </AppText>
          </View>

          <View style={styles.countBadge}>
            <Ionicons name="repeat" size={14} color={Colors.primary} />
            <AppText variant="captionStrong" color={Colors.primaryDeep} style={{ marginLeft: 4 }}>
              {insights.activeCount} active
            </AppText>
          </View>
        </View>
      </GlassCard>

      {/* Upcoming timeline (next 30 days) */}
      {insights.upcomingNext30Days.length > 0 && (
        <GlassCard padding={18} style={styles.card}>
          <AppText variant="h3">Due in the Next 30 Days</AppText>
          <View style={styles.upcomingList}>
            {insights.upcomingNext30Days.map((item, idx) => {
              const category = state.categories.find(c => c.id === item.rule.categoryId);
              return (
                <View key={idx} style={styles.upcomingItem}>
                  <IconBadge
                    icon={category?.icon ?? 'repeat'}
                    color={category?.color ?? Colors.primary}
                    size={32}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <AppText variant="bodyStrong">
                      {item.rule.payee || item.rule.note || 'Recurring payment'}
                    </AppText>
                    <AppText variant="caption" color={Colors.textSecondary}>
                      {item.daysUntil === 0
                        ? 'Due today'
                        : item.daysUntil === 1
                        ? 'Due tomorrow'
                        : `In ${item.daysUntil} days (${item.dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`}
                    </AppText>
                  </View>
                  <AppText variant="bodyStrong" color={Colors.expense}>
                    {formatCurrency(item.rule.amount, currency)}
                  </AppText>
                </View>
              );
            })}
          </View>
        </GlassCard>
      )}

      {/* Active recurring rules list */}
      <GlassCard padding={18} style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="h3">All Recurring Rules</AppText>
          <Pressable
            onPress={() => {
              haptics.press();
              router.push('/add-recurring' as any);
            }}
            hitSlop={8}
          >
            <AppText variant="captionStrong" color={Colors.primary}>
              + Add New
            </AppText>
          </Pressable>
        </View>

        <View style={styles.rulesList}>
          {insights.rules.map(rule => {
            const category = state.categories.find(c => c.id === rule.categoryId);
            return (
              <Pressable
                key={rule.id}
                onPress={() => {
                  haptics.press();
                  router.push({
                    pathname: '/add-recurring' as any,
                    params: { id: rule.id },
                  });
                }}
                style={({ pressed }) => [
                  styles.ruleItem,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <IconBadge
                  icon={category?.icon ?? 'repeat'}
                  color={category?.color ?? Colors.primary}
                  size={40}
                />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <AppText variant="bodyStrong">
                    {rule.payee || rule.note || 'Recurring rule'}
                  </AppText>
                  <AppText variant="caption" color={Colors.textSecondary}>
                    {describeFrequency(rule)} · Next: {rule.nextDue}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <AppText variant="bodyStrong" color={rule.type === 'expense' ? Colors.expense : Colors.income}>
                    {formatCurrency(rule.amount, currency)}
                  </AppText>
                  <AppText variant="caption" color={Colors.textMuted} style={{ fontSize: 10 }}>
                    {rule.autoCreate ? '⚡ Auto' : '⏰ Reminder'}
                  </AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  card: {
    gap: Spacing.md,
  },
  heroCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingList: {
    gap: 10,
  },
  upcomingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
  },
  rulesList: {
    gap: 8,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
  },
});
