import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { IconButton } from '@/components/ui/icon-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { IconBadge } from '@/components/finance/icon-badge';
import { useFinance } from '@/context/finance-context';
import { SplitParticipant, Transaction } from '@/types/finance';
import { formatCurrency } from '@/utils/currency';
import { haptics } from '@/utils/haptics';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { getTransactionById, getRepaymentsForSplit } from '@/db/transactions';
import { listSplitParticipants, markParticipantPaid } from '@/db/splits';

export default function SplitDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { state } = useFinance();

  const [tx, setTx] = useState<Transaction | null>(null);
  const [participants, setParticipants] = useState<SplitParticipant[]>([]);
  const [repayments, setRepayments] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!params.id) return;
    try {
      const db = await getDb();
      const [fetchedTx, fetchedParticipants, fetchedRepayments] = await Promise.all([
        getTransactionById(db, params.id),
        listSplitParticipants(db, params.id),
        getRepaymentsForSplit(db, params.id),
      ]);
      setTx(fetchedTx);
      setParticipants(fetchedParticipants);
      setRepayments(fetchedRepayments);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currency = state.settings.currency ?? 'INR';
  const accountById = useMemo(
    () => new Map(state.accounts.map(a => [a.id, a])),
    [state.accounts]
  );
  const categoryById = useMemo(
    () => new Map(state.categories.map(c => [c.id, c])),
    [state.categories]
  );

  const txCategory = tx?.categoryId ? categoryById.get(tx.categoryId) : undefined;
  const txAccount = tx?.accountId ? accountById.get(tx.accountId) : undefined;

  const totalOwed = useMemo(
    () => participants.reduce((sum, p) => sum + p.shareAmount, 0),
    [participants]
  );
  const totalPaid = useMemo(
    () => participants.reduce((sum, p) => sum + p.paidAmount, 0),
    [participants]
  );
  const remainingOwed = Math.max(0, totalOwed - totalPaid);
  const isFullySettled = totalOwed > 0 && remainingOwed <= 0;
  const userShare = tx ? Math.max(0, tx.amount - totalOwed) : 0;

  // The receiving account defaults to the original expense's own account —
  // one tap logs the repayment there, with no separate account/amount/note
  // form to fill in first.
  const receivingAccountId = tx?.accountId ?? state.accounts[0]?.id;

  const markPaid = async (participant: SplitParticipant) => {
    if (!receivingAccountId) return;
    setPayingId(participant.id);
    try {
      const db = await getDb();
      await markParticipantPaid(db, {
        participantId: participant.id,
        accountId: receivingAccountId,
      });
      haptics.success();
      await loadData();
    } catch {
      Alert.alert('Error', 'Failed to mark this participant as paid.');
    } finally {
      setPayingId(null);
    }
  };

  const confirmMarkPaid = (participant: SplitParticipant) => {
    Alert.alert(
      `Mark ${participant.name} as paid?`,
      `Logs ${formatCurrency(participant.shareAmount, currency)} as income into your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Mark as Paid', onPress: () => markPaid(participant) },
      ]
    );
  };

  const handleSettleAll = () => {
    const pending = participants.filter(p => p.status !== 'paid');
    if (pending.length === 0 || !receivingAccountId) return;

    Alert.alert(
      'Settle All Remaining',
      `Mark all ${pending.length} remaining participant${pending.length === 1 ? '' : 's'} as paid (${formatCurrency(remainingOwed, currency)} total)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Settle All',
          onPress: async () => {
            try {
              const db = await getDb();
              for (const p of pending) {
                await markParticipantPaid(db, {
                  participantId: p.id,
                  accountId: receivingAccountId,
                  note: `Full settlement from ${p.name}`,
                });
              }
              haptics.success();
              await loadData();
            } catch {
              Alert.alert('Error', 'Failed to settle all participants.');
            }
          },
        },
      ]
    );
  };

  const paidCount = participants.filter(p => p.status === 'paid').length;
  const percentSettled = totalOwed > 0 ? Math.min(100, Math.round((totalPaid / totalOwed) * 100)) : 0;
  const receivingAccount = receivingAccountId ? accountById.get(receivingAccountId) : undefined;
  const billTitle = tx?.payee || tx?.note || 'Shared Expense';
  const billDateStr = tx?.date
    ? new Date(tx.date).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

  if (loading) {
    return (
      <GradientScreen edges={['top', 'bottom']} contours="top">
        <ModalHeader title="Split Details" onClose={() => router.back()} />
        <View style={styles.loadingContainer}>
          <AppText variant="body" color={Colors.textSecondary}>Loading split details...</AppText>
        </View>
      </GradientScreen>
    );
  }

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader
        title="Split Details"
        onClose={() => router.back()}
        rightAction={
          tx ? (
            <IconButton
              iconName="pencil-outline"
              onPress={() => router.push(`/add-transaction?id=${tx.id}` as any)}
              size={42}
            />
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Bill Overview Card */}
        <GlassCard strong elevated padding={20} style={styles.heroCard}>
          {/* Top Title & Category Header */}
          <View style={styles.heroTopRow}>
            <IconBadge
              icon={txCategory?.icon ?? 'receipt-outline'}
              color={txCategory?.color ?? Colors.primary}
              size={44}
            />
            <View style={styles.heroTitleCol}>
              <AppText variant="h2" color={Colors.textPrimary} numberOfLines={1}>
                {billTitle}
              </AppText>
              <AppText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
                {[txCategory?.name, txAccount?.name, billDateStr].filter(Boolean).join(' · ')}
              </AppText>
            </View>
          </View>

          {/* Large Hero Amount */}
          <View style={styles.heroAmountSection}>
            <AppText variant="micro" color={Colors.textMuted} style={styles.heroAmountLabel}>
              TOTAL BILL
            </AppText>
            <AppText variant="h1" color={Colors.textPrimary} style={styles.heroAmountText}>
              {tx ? formatCurrency(tx.amount, currency) : '—'}
            </AppText>
          </View>

          {/* Progress & Collection Status */}
          <View style={styles.progressSection}>
            <View style={styles.progressLabelRow}>
              <View style={[styles.progressStatusTag, isFullySettled && styles.progressStatusTagSettled]}>
                <Ionicons
                  name={isFullySettled ? 'checkmark-circle' : 'hourglass-outline'}
                  size={13}
                  color={isFullySettled ? Colors.income : Colors.primaryDeep}
                />
                <AppText
                  variant="captionStrong"
                  color={isFullySettled ? Colors.income : Colors.primaryDeep}
                  style={{ marginLeft: 4, fontSize: 12 }}
                >
                  {isFullySettled
                    ? 'All Settled'
                    : `${formatCurrency(remainingOwed, currency)} remaining`}
                </AppText>
              </View>

              <AppText variant="caption" color={Colors.textMuted} style={{ fontSize: 12 }}>
                {paidCount} of {participants.length} friends paid
              </AppText>
            </View>

            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${totalOwed > 0 ? percentSettled : 100}%` },
                  isFullySettled ? { backgroundColor: Colors.income } : { backgroundColor: Colors.primary },
                ]}
              />
            </View>
          </View>

          {/* 3-Way Metric Breakdown */}
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownCol}>
              <AppText variant="micro" color={Colors.textMuted}>YOUR SHARE</AppText>
              <AppText variant="bodyStrong" color={Colors.primaryDeep} style={styles.breakdownNumber}>
                {formatCurrency(userShare, currency)}
              </AppText>
            </View>

            <View style={styles.breakdownDivider} />

            <View style={styles.breakdownCol}>
              <AppText variant="micro" color={Colors.textMuted}>LENT OUT</AppText>
              <AppText variant="bodyStrong" color={Colors.textPrimary} style={styles.breakdownNumber}>
                {formatCurrency(totalOwed, currency)}
              </AppText>
            </View>

            <View style={styles.breakdownDivider} />

            <View style={styles.breakdownCol}>
              <AppText variant="micro" color={Colors.textMuted}>
                {isFullySettled ? 'COLLECTED' : 'COLLECTED'}
              </AppText>
              <AppText
                variant="bodyStrong"
                color={isFullySettled ? Colors.income : Colors.income}
                style={styles.breakdownNumber}
              >
                {formatCurrency(totalPaid, currency)}
              </AppText>
            </View>
          </View>
        </GlassCard>

        {/* Participants Debt & Settlement List Card */}
        <GlassCard padding={20} style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <AppText variant="micro" color={Colors.textMuted} style={styles.sectionHeaderTitle}>
              PARTICIPANTS ({participants.length})
            </AppText>
            {!isFullySettled && participants.length > 0 && (
              <Pressable onPress={handleSettleAll} hitSlop={8} style={styles.settleAllLink}>
                <Ionicons name="checkmark-done" size={14} color={Colors.primaryDeep} />
                <AppText variant="captionStrong" color={Colors.primaryDeep}>
                  Settle All ({formatCurrency(remainingOwed, currency)})
                </AppText>
              </Pressable>
            )}
          </View>

          <View style={styles.participantsList}>
            {participants.map((p, idx) => {
              const isPaid = p.status === 'paid';
              const showDivider = idx < participants.length - 1;

              return (
                <View key={p.id} style={styles.participantRowWrapper}>
                  <View style={styles.participantRow}>
                    {/* Avatar Initial */}
                    <View style={[styles.avatar, isPaid && styles.avatarPaid]}>
                      {isPaid ? (
                        <Ionicons name="checkmark" size={16} color={Colors.income} />
                      ) : (
                        <AppText variant="captionStrong" color={Colors.primaryDeep} style={styles.avatarInitial}>
                          {p.name.charAt(0).toUpperCase()}
                        </AppText>
                      )}
                    </View>

                    {/* Participant Details */}
                    <View style={styles.participantInfo}>
                      <AppText variant="bodyStrong" color={Colors.textPrimary} numberOfLines={1}>
                        {p.name}
                      </AppText>
                      <AppText
                        variant="caption"
                        color={isPaid ? Colors.income : Colors.textSecondary}
                        numberOfLines={1}
                        style={{ marginTop: 1 }}
                      >
                        {isPaid
                          ? `Paid in full (${formatCurrency(p.shareAmount, currency)})`
                          : `Owes ${formatCurrency(p.shareAmount, currency)}`}
                      </AppText>
                    </View>

                    {/* Action / Settled State */}
                    {!isPaid ? (
                      <Pressable
                        onPress={() => confirmMarkPaid(p)}
                        disabled={payingId === p.id}
                        style={styles.markPaidBtn}
                      >
                        <Ionicons name="checkmark-circle-outline" size={14} color={Colors.primaryDeep} />
                        <AppText variant="captionStrong" color={Colors.primaryDeep} style={{ fontSize: 12 }}>
                          Mark Paid
                        </AppText>
                      </Pressable>
                    ) : (
                      <View style={styles.paidBadge}>
                        <Ionicons name="checkmark-circle" size={13} color={Colors.income} />
                        <AppText variant="captionStrong" color={Colors.income} style={{ marginLeft: 4, fontSize: 12 }}>
                          Settled
                        </AppText>
                      </View>
                    )}
                  </View>

                  {showDivider && <View style={styles.rowDivider} />}
                </View>
              );
            })}
          </View>
        </GlassCard>

        {/* Received Repayments Settlement History Card */}
        {repayments.length > 0 && (
          <GlassCard padding={20} style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <AppText variant="micro" color={Colors.textMuted} style={styles.sectionHeaderTitle}>
                SETTLEMENT ACTIVITY ({repayments.length})
              </AppText>
            </View>

            <View style={styles.repaymentsList}>
              {repayments.map((r, idx) => {
                const repAccount = accountById.get(r.accountId);
                const repDate = new Date(r.date).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                });
                const showDivider = idx < repayments.length - 1;

                return (
                  <View key={r.id} style={styles.repaymentRowWrapper}>
                    <View style={styles.repaymentRow}>
                      <View style={styles.repaymentAvatar}>
                        <Ionicons name="arrow-down" size={14} color={Colors.income} />
                      </View>
                      <View style={styles.repaymentInfo}>
                        <AppText variant="bodyStrong" color={Colors.textPrimary} numberOfLines={1}>
                          {r.payee || r.note || 'Repayment'}
                        </AppText>
                        <AppText variant="caption" color={Colors.textSecondary} numberOfLines={1} style={{ marginTop: 1 }}>
                          Received into {repAccount?.name ?? 'Account'} · {repDate}
                        </AppText>
                      </View>
                      <AppText variant="bodyStrong" color={Colors.income} style={{ fontSize: 15 }}>
                        +{formatCurrency(r.amount, currency)}
                      </AppText>
                    </View>

                    {showDivider && <View style={styles.rowDivider} />}
                  </View>
                );
              })}
            </View>
          </GlassCard>
        )}
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    gap: 16,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroTitleCol: {
    flex: 1,
    gap: 3,
  },
  heroAmountSection: {
    alignItems: 'flex-start',
    gap: 2,
    marginTop: 2,
  },
  heroAmountLabel: {
    letterSpacing: 1,
  },
  heroAmountText: {
    fontSize: 32,
    fontFamily: 'Sora_700Bold',
  },
  progressSection: {
    gap: 8,
  },
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressStatusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
  },
  progressStatusTagSettled: {
    backgroundColor: Colors.incomeSoft,
  },
  progressBarTrack: {
    height: 5,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(25, 21, 39, 0.06)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.pill,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
  },
  breakdownCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  breakdownNumber: {
    fontSize: 14,
    fontFamily: 'Sora_700Bold',
  },
  breakdownDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.divider,
  },
  card: {
    gap: 14,
    borderRadius: BorderRadius.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHeaderTitle: {
    letterSpacing: 1,
  },
  settleAllLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
  },
  participantsList: {
    gap: 0,
  },
  participantRowWrapper: {
    gap: 0,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  avatarPaid: {
    backgroundColor: Colors.incomeSoft,
  },
  avatarInitial: {
    fontSize: 15,
    fontFamily: 'Sora_700Bold',
    color: Colors.primaryDeep,
  },
  participantInfo: {
    flex: 1,
    minWidth: 0,
  },
  markPaidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.incomeSoft,
  },
  rowDivider: {
    height: 1,
    backgroundColor: Colors.divider,
  },
  repaymentsList: {
    gap: 0,
  },
  repaymentRowWrapper: {
    gap: 0,
  },
  repaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  repaymentAvatar: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.incomeSoft,
  },
  repaymentInfo: {
    flex: 1,
    minWidth: 0,
  },
});
