import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { GlassCard } from '@/components/ui/glass-card';
import { RecurringInsights } from '@/db/insights';
import { useFinance } from '@/context/finance-context';
import { formatCurrency } from '@/utils/currency';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { haptics } from '@/utils/haptics';

interface RecurringSummaryCardProps {
  insights: RecurringInsights | null;
  animateIndex?: number;
}

/**
 * A unique, high-end fintech card for recurring commitments and subscriptions.
 * Features an upcoming bill countdown ticker, active rule pills, annual run-rate,
 * and seamless interactive navigation.
 */
export function RecurringSummaryCard({ insights, animateIndex }: RecurringSummaryCardProps) {
  const router = useRouter();
  const { state } = useFinance();
  const currency = state.settings.currency ?? 'INR';
  const numberFormat = state.settings.numberFormat;

  const hasData = !!insights && insights.activeCount > 0;
  const nextPayment = insights?.upcomingNext30Days?.[0];

  const goToManage = () => {
    haptics.press();
    router.push('/add-recurring' as any);
  };

  return (
    <Pressable
      onPress={goToManage}
      style={({ pressed }) => [styles.wrapper, { opacity: pressed ? 0.88 : 1 }]}
    >
      <GlassCard
        padding={16}
        radius={BorderRadius.lg}
        strong
        elevated
        animateIndex={animateIndex}
        style={styles.card}
      >
        {/* Top Header */}
        <View style={styles.headerRow}>
          <View style={styles.iconTitleGroup}>
            <View style={styles.iconBadge}>
              <Ionicons name="repeat" size={18} color={Colors.primary} />
            </View>
            <View>
              <AppText variant="caption" color={Colors.textSecondary}>
                Monthly Commitments
              </AppText>
              <AppText variant="micro" color={Colors.textMuted}>
                Fixed bills & subscriptions
              </AppText>
            </View>
          </View>

          {hasData ? (
            <View style={styles.activePill}>
              <View style={styles.pulseDot} />
              <AppText variant="micro" color={Colors.primaryDeep} style={styles.pillText}>
                {insights.activeCount} active
              </AppText>
            </View>
          ) : (
            <View style={styles.arrowCircle}>
              <Ionicons name="chevron-forward" size={14} color={Colors.textSecondary} />
            </View>
          )}
        </View>

        {/* Hero Value Section */}
        <View style={styles.amountBlock}>
          <View style={styles.amountRow}>
            <AppText
              variant="display"
              color={hasData ? Colors.primaryDeep : Colors.textPrimary}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={styles.amountText}
            >
              {hasData
                ? formatCurrency(insights.monthlyTotal, currency, numberFormat)
                : formatCurrency(0, currency, numberFormat)}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary} style={styles.perMonth}>
              /month
            </AppText>
          </View>

          <AppText variant="micro" color={Colors.textMuted} style={styles.annualSub}>
            {hasData
              ? `~${formatCurrency(insights.yearlyTotal, currency, numberFormat)} projected yearly`
              : 'Zero recurring commitments tracked'}
          </AppText>
        </View>

        {/* Unique Feature: Upcoming Ticker or Add Prompt */}
        {hasData && nextPayment ? (
          <View style={styles.upcomingBar}>
            <View style={styles.upcomingLeft}>
              <Ionicons name="flash-outline" size={13} color={Colors.primary} />
              <AppText variant="micro" color={Colors.textPrimary} numberOfLines={1} style={{ flex: 1 }}>
                Next:{' '}
                <AppText variant="micro" color={Colors.primaryDeep} style={{ fontWeight: '700' }}>
                  {nextPayment.rule.payee || nextPayment.rule.note || 'Upcoming bill'}
                </AppText>
                {' · '}
                {formatCurrency(nextPayment.rule.amount, currency, numberFormat)}
              </AppText>
            </View>
            <View style={styles.daysBadge}>
              <AppText variant="micro" color={Colors.primaryDeep} style={styles.daysText}>
                {nextPayment.daysUntil === 0
                  ? 'Today'
                  : nextPayment.daysUntil === 1
                    ? 'Tomorrow'
                    : `in ${nextPayment.daysUntil}d`}
              </AppText>
            </View>
          </View>
        ) : (
          <View style={styles.actionPrompt}>
            <View style={styles.actionPromptIcon}>
              <Ionicons name="add" size={14} color={Colors.primary} />
            </View>
            <AppText variant="captionStrong" color={Colors.primary} style={{ flex: 1 }}>
              Add subscription or recurring bill
            </AppText>
            <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
          </View>
        )}
      </GlassCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  card: {
    width: '100%',
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowCircle: {
    width: 26,
    height: 26,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
    gap: 4,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  amountBlock: {
    gap: 2,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  amountText: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
  },
  perMonth: {
    fontSize: 13,
    fontWeight: '600',
  },
  annualSub: {
    marginTop: 1,
  },
  upcomingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(139, 92, 246, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.12)',
    gap: 8,
  },
  upcomingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  daysBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  daysText: {
    fontSize: 10,
    fontWeight: '700',
  },
  actionPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.18)',
    gap: 8,
  },
  actionPromptIcon: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
