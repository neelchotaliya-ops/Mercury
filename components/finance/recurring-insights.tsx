import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { GlassCard } from '@/components/ui/glass-card';
import { RecurringInsights } from '@/db/insights';
import { useFinance } from '@/context/finance-context';
import { formatCurrency } from '@/utils/currency';
import { Colors, BorderRadius } from '@/constants/theme';
import { haptics } from '@/utils/haptics';

interface RecurringSummaryCardProps {
  insights: RecurringInsights | null;
}

/**
 * A compact, read-only glance at recurring payments for the Insights tab —
 * the monthly commitment total and active count, with a link into the
 * Manage hub's Recurring Payments screen (app/add-recurring.tsx's own
 * hub/list mode) for anything beyond glancing. The full rules list used to
 * live here too, but that duplicated add-recurring.tsx's own hub view —
 * one place to see/edit every rule is enough.
 */
export function RecurringSummaryCard({ insights }: RecurringSummaryCardProps) {
  const router = useRouter();
  const { state } = useFinance();
  const currency = state.settings.currency ?? 'INR';
  const hasData = !!insights && insights.activeCount > 0;

  const goToManage = () => {
    haptics.press();
    router.push('/add-recurring' as any);
  };

  return (
    <GlassCard padding={18} strong elevated style={styles.heroCard}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <AppText variant="caption" color={Colors.textSecondary}>
            Monthly Commitment
          </AppText>
          {hasData ? (
            <>
              <AppText variant="h1" color={Colors.primaryDeep} style={styles.amount}>
                {formatCurrency(insights.monthlyTotal, currency)}
              </AppText>
              <AppText variant="caption" color={Colors.textMuted} style={styles.subline}>
                ~{formatCurrency(insights.yearlyTotal, currency)} per year
              </AppText>
            </>
          ) : (
            <AppText variant="body" color={Colors.textSecondary} style={styles.emptyLine}>
              No recurring payments yet
            </AppText>
          )}
        </View>

        {hasData ? (
          <View style={styles.countBadge}>
            <Ionicons name="repeat" size={14} color={Colors.primary} />
            <AppText variant="captionStrong" color={Colors.primaryDeep} style={styles.badgeText}>
              {insights.activeCount} active
            </AppText>
          </View>
        ) : null}
      </View>

      <Pressable onPress={goToManage} hitSlop={8} style={styles.manageLink}>
        <AppText variant="captionStrong" color={Colors.primary}>
          {hasData ? 'Manage →' : '+ Add a recurring payment'}
        </AppText>
      </Pressable>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerText: {
    flex: 1,
  },
  amount: {
    marginTop: 2,
  },
  subline: {
    marginTop: 2,
  },
  emptyLine: {
    marginTop: 4,
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
  },
  badgeText: {
    marginLeft: 4,
  },
  manageLink: {
    marginTop: 12,
  },
});
