import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GlassCard } from '@/components/ui/glass-card';
import { SplitInsights } from '@/db/insights';
import { useFinance } from '@/context/finance-context';
import { formatCurrency } from '@/utils/currency';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { haptics } from '@/utils/haptics';

interface SplitInsightsViewProps {
  insights: SplitInsights | null;
}

/**
 * A compact, read-only glance at split expenses for the Insights tab — the
 * total owed to you and how many are still pending, with a link into the
 * Manage hub's Split Expenses screen (app/manage-splits.tsx, which renders
 * the full SplitInsightsView below) for anything beyond glancing.
 */
export function SplitSummaryCard({ insights }: SplitInsightsViewProps) {
  const router = useRouter();
  const { state } = useFinance();
  const currency = state.settings.currency ?? 'INR';
  const outstandingTotal = (insights?.totalOwed ?? 0) - (insights?.totalSettled ?? 0);
  const hasData = !!insights && (insights.totalOwed > 0 || insights.unsettledSplits.length > 0);
  const pendingCount = insights?.pendingCount ?? 0;

  const goToManage = () => {
    haptics.press();
    router.push('/manage-splits' as any);
  };

  return (
    <GlassCard padding={18} strong elevated style={styles.heroCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <AppText variant="caption" color={Colors.textSecondary}>Total Owed to You</AppText>
          {hasData ? (
            <>
              <AppText variant="h1" color={Colors.income} style={{ marginTop: 2 }}>
                {formatCurrency(Math.max(0, outstandingTotal), currency)}
              </AppText>
              <AppText variant="caption" color={Colors.textMuted} style={{ marginTop: 2 }}>
                {formatCurrency(insights?.totalSettled ?? 0, currency)} collected so far
              </AppText>
            </>
          ) : (
            <AppText variant="body" color={Colors.textSecondary} style={{ marginTop: 4 }}>
              No shared expenses yet
            </AppText>
          )}
        </View>

        {hasData && pendingCount > 0 ? (
          <View style={styles.pendingBadge}>
            <Ionicons name="time" size={14} color={Colors.expense} />
            <AppText variant="captionStrong" color={Colors.expense} style={{ marginLeft: 4 }}>
              {pendingCount} pending
            </AppText>
          </View>
        ) : null}
      </View>

      <Pressable onPress={goToManage} hitSlop={8} style={{ marginTop: 12 }}>
        <AppText variant="captionStrong" color={Colors.primary}>
          {hasData ? 'Manage →' : '+ Split an expense'}
        </AppText>
      </Pressable>
    </GlassCard>
  );
}

export function SplitInsightsView({ insights }: SplitInsightsViewProps) {
  const router = useRouter();
  const { state } = useFinance();
  const currency = state.settings.currency ?? 'INR';

  const outstandingTotal = (insights?.totalOwed ?? 0) - (insights?.totalSettled ?? 0);

  if (!insights || (insights.totalOwed === 0 && insights.unsettledSplits.length === 0)) {
    return (
      <GlassCard padding={24} style={styles.emptyCard}>
        <View style={styles.emptyIcon}>
          <Ionicons name="people-outline" size={32} color={Colors.primary} />
        </View>
        <AppText variant="h3" style={{ marginTop: 12 }}>
          No Shared Expenses
        </AppText>
        <AppText variant="body" color={Colors.textSecondary} style={{ textAlign: 'center', marginTop: 6 }}>
          Split group dinners, travel, rent, and household bills, and track who owes you what.
        </AppText>
        <AppButton
          title="+ Split an Expense"
          size="md"
          onPress={() => {
            haptics.press();
            router.push('/add-split' as any);
          }}
          style={{ marginTop: 18 }}
        />
      </GlassCard>
    );
  }

  return (
    <View style={styles.container}>
      {/* Owed summary hero card */}
      <GlassCard padding={18} strong elevated style={styles.heroCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <AppText variant="caption" color={Colors.textSecondary}>Total Owed to You</AppText>
            <AppText variant="h1" color={Colors.income} style={{ marginTop: 2 }}>
              {formatCurrency(Math.max(0, outstandingTotal), currency)}
            </AppText>
            <AppText variant="caption" color={Colors.textMuted} style={{ marginTop: 2 }}>
              {formatCurrency(insights.totalSettled, currency)} collected so far
            </AppText>
          </View>

          <View style={styles.badgeWrap}>
            <View style={styles.pendingBadge}>
              <Ionicons name="time" size={14} color={Colors.expense} />
              <AppText variant="captionStrong" color={Colors.expense} style={{ marginLeft: 4 }}>
                {insights.pendingCount} pending
              </AppText>
            </View>
          </View>
        </View>
      </GlassCard>

      {/* Unsettled splits card */}
      <GlassCard padding={18} style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="h3">Unsettled Splits</AppText>
          <Pressable
            onPress={() => {
              haptics.press();
              router.push('/add-split' as any);
            }}
            hitSlop={8}
          >
            <AppText variant="captionStrong" color={Colors.primary}>
              + Split New
            </AppText>
          </Pressable>
        </View>

        {insights.unsettledSplits.length === 0 ? (
          <View style={styles.allSettledWrap}>
            <Ionicons name="checkmark-circle" size={28} color={Colors.income} />
            <AppText variant="bodyStrong" color={Colors.income} style={{ marginTop: 4 }}>
              All caught up!
            </AppText>
            <AppText variant="caption" color={Colors.textMuted}>
              You have no outstanding balances to collect.
            </AppText>
          </View>
        ) : (
          <View style={styles.splitsList}>
            {insights.unsettledSplits.map(split => {
              const pendingNames = split.participants
                .filter(p => p.status !== 'paid')
                .map(p => p.name)
                .join(', ');

              return (
                <Pressable
                  key={split.transactionId}
                  onPress={() => {
                    haptics.press();
                    router.push({
                      pathname: '/split-detail' as any,
                      params: { id: split.transactionId },
                    });
                  }}
                  style={({ pressed }) => [
                    styles.splitItem,
                    { opacity: pressed ? 0.75 : 1 },
                  ]}
                >
                  <View style={styles.avatar}>
                    <Ionicons name="people" size={18} color={Colors.primary} />
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <AppText variant="bodyStrong">
                      {pendingNames || 'Shared expense'}
                    </AppText>
                    <AppText variant="caption" color={Colors.textSecondary}>
                      {split.participants.length} participants · Tap to settle
                    </AppText>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <AppText variant="bodyStrong" color={Colors.income}>
                      {formatCurrency(split.outstanding, currency)}
                    </AppText>
                    <AppText variant="caption" color={Colors.textMuted} style={{ fontSize: 10 }}>
                      unpaid
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
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
  badgeWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.expenseSoft,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allSettledWrap: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 2,
  },
  splitsList: {
    gap: 8,
  },
  splitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
