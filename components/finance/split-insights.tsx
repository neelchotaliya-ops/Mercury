import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GlassCard } from '@/components/ui/glass-card';
import { ProgressBar } from '@/components/finance/progress-bar';
import { SplitInsights } from '@/db/insights';
import { useFinance } from '@/context/finance-context';
import { formatCurrency } from '@/utils/currency';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { haptics } from '@/utils/haptics';

interface SplitInsightsViewProps {
  insights: SplitInsights | null;
  animateIndex?: number;
}

/**
 * A unique, high-end fintech card for shared expenses and split debts.
 * Features a visual settlement progress ratio, pending debtor pills,
 * clear collected sums, and seamless interactive navigation.
 */
export function SplitSummaryCard({ insights, animateIndex }: SplitInsightsViewProps) {
  const router = useRouter();
  const { state } = useFinance();
  const currency = state.settings.currency ?? 'INR';
  const numberFormat = state.settings.numberFormat;

  const totalOwed = insights?.totalOwed ?? 0;
  const totalSettled = insights?.totalSettled ?? 0;
  const outstandingTotal = Math.max(0, totalOwed - totalSettled);
  const pendingCount = insights?.pendingCount ?? 0;
  const hasData = !!insights && (totalOwed > 0 || (insights.unsettledSplits?.length ?? 0) > 0);

  // Settlement completion percentage
  const settlementRatio = totalOwed > 0 ? Math.min(1, totalSettled / totalOwed) : 0;
  const settlementPercent = Math.round(settlementRatio * 100);

  // Unsettled splits participants list
  const unsettledParticipants = React.useMemo(() => {
    if (!insights?.unsettledSplits) return [];
    const list: string[] = [];
    for (const s of insights.unsettledSplits) {
      for (const p of s.participants) {
        if (p.status !== 'paid' && !list.includes(p.name)) {
          list.push(p.name);
        }
      }
    }
    return list;
  }, [insights]);

  const goToManage = () => {
    haptics.press();
    router.push('/manage-splits' as any);
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
              <Ionicons name="people" size={18} color={Colors.income} />
            </View>
            <View>
              <AppText variant="caption" color={Colors.textSecondary}>
                Total Owed to You
              </AppText>
              <AppText variant="micro" color={Colors.textMuted}>
                Shared bills & group balances
              </AppText>
            </View>
          </View>

          {hasData && pendingCount > 0 ? (
            <View style={styles.duePill}>
              <Ionicons name="time" size={10} color={Colors.expense} />
              <AppText variant="micro" color={Colors.expense} style={styles.pillText}>
                {pendingCount} pending
              </AppText>
            </View>
          ) : hasData ? (
            <View style={styles.settledPill}>
              <Ionicons name="checkmark" size={11} color={Colors.income} />
              <AppText variant="micro" color={Colors.income} style={styles.pillText}>
                All settled
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
              color={outstandingTotal > 0 ? Colors.income : Colors.textPrimary}
              numberOfLines={1}
              adjustsFontSizeToFit
              style={styles.amountText}
            >
              {formatCurrency(outstandingTotal, currency, numberFormat)}
            </AppText>
            <AppText variant="caption" color={Colors.textSecondary} style={styles.unpaidTag}>
              unpaid
            </AppText>
          </View>

          <AppText variant="micro" color={Colors.textMuted} style={styles.collectedSub}>
            {hasData
              ? `${formatCurrency(totalSettled, currency, numberFormat)} collected of ${formatCurrency(totalOwed, currency, numberFormat)} total`
              : 'Zero shared expenses tracked'}
          </AppText>
        </View>

        {/* Unique Feature: Settlement Gauge or Split Action Prompt */}
        {hasData && totalOwed > 0 ? (
          <View style={styles.settlementBlock}>
            {/* Progress Gauge */}
            <View style={styles.progressRow}>
              <AppText variant="micro" color={Colors.textSecondary}>
                Settlement Progress
              </AppText>
              <AppText variant="micro" color={Colors.income} style={{ fontWeight: '700' }}>
                {settlementPercent}% settled
              </AppText>
            </View>
            <ProgressBar progress={settlementRatio} height={6} color={Colors.income} />

            {/* Unsettled debtor badges if any */}
            {unsettledParticipants.length > 0 ? (
              <View style={styles.debtorRow}>
                <AppText variant="micro" color={Colors.textMuted}>
                  Pending:
                </AppText>
                <View style={styles.debtorPills}>
                  {unsettledParticipants.slice(0, 3).map(name => (
                    <View key={name} style={styles.debtorChip}>
                      <AppText variant="micro" color={Colors.textPrimary} style={{ fontSize: 10 }}>
                        {name}
                      </AppText>
                    </View>
                  ))}
                  {unsettledParticipants.length > 3 ? (
                    <View style={styles.debtorChip}>
                      <AppText variant="micro" color={Colors.textSecondary} style={{ fontSize: 10 }}>
                        +{unsettledParticipants.length - 3}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.actionPrompt}>
            <View style={styles.actionPromptIcon}>
              <Ionicons name="add" size={14} color={Colors.income} />
            </View>
            <AppText variant="captionStrong" color={Colors.income} style={{ flex: 1 }}>
              Split dinner, trip, or rent with friends
            </AppText>
            <Ionicons name="arrow-forward" size={14} color={Colors.income} />
          </View>
        )}
      </GlassCard>
    </Pressable>
  );
}

export function SplitInsightsView({ insights }: SplitInsightsViewProps) {
  const router = useRouter();
  const { state } = useFinance();
  const currency = state.settings.currency ?? 'INR';
  const numberFormat = state.settings.numberFormat;

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
              {formatCurrency(Math.max(0, outstandingTotal), currency, numberFormat)}
            </AppText>
            <AppText variant="caption" color={Colors.textMuted} style={{ marginTop: 2 }}>
              {formatCurrency(insights.totalSettled, currency, numberFormat)} collected so far
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
      <GlassCard padding={18} style={styles.fullCard}>
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
                      {formatCurrency(split.outstanding, currency, numberFormat)}
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
    backgroundColor: Colors.incomeSoft,
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
  duePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.expenseSoft,
    gap: 4,
  },
  settledPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.incomeSoft,
    gap: 4,
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
  unpaidTag: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.income,
  },
  collectedSub: {
    marginTop: 1,
  },
  settlementBlock: {
    gap: 8,
    paddingTop: 4,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  debtorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  debtorPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  debtorChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(25, 21, 39, 0.06)',
  },
  actionPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(46, 169, 124, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(46, 169, 124, 0.18)',
    gap: 8,
  },
  actionPromptIcon: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.incomeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    gap: Spacing.md,
  },
  fullCard: {
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
