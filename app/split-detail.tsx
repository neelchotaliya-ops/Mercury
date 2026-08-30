import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { useFinance } from '@/context/finance-context';
import { SplitParticipant, Transaction } from '@/types/finance';
import { formatCurrency } from '@/utils/currency';
import { haptics } from '@/utils/haptics';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { getTransactionById } from '@/db/transactions';
import { listSplitParticipants, markParticipantPaid } from '@/db/splits';

export default function SplitDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { state } = useFinance();

  const [tx, setTx] = useState<Transaction | null>(null);
  const [participants, setParticipants] = useState<SplitParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!params.id) return;
    try {
      const db = await getDb();
      const [fetchedTx, fetchedParticipants] = await Promise.all([
        getTransactionById(db, params.id),
        listSplitParticipants(db, params.id),
      ]);
      setTx(fetchedTx);
      setParticipants(fetchedParticipants);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currency = state.settings.currency ?? 'INR';

  const totalOwed = useMemo(
    () => participants.reduce((sum, p) => sum + p.shareAmount, 0),
    [participants]
  );
  const totalPaid = useMemo(
    () => participants.reduce((sum, p) => sum + p.paidAmount, 0),
    [participants]
  );
  const remainingOwed = totalOwed - totalPaid;
  const isFullySettled = totalOwed > 0 && remainingOwed <= 0;

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
                await markParticipantPaid(db, { participantId: p.id, accountId: receivingAccountId, note: `Full settlement from ${p.name}` });
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
      <ModalHeader title="Split Expense" onClose={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Bill summary header */}
        <GlassCard padding={18} style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <AppText variant="caption" color={Colors.textSecondary}>Total Bill</AppText>
              <AppText variant="h1" color={Colors.textPrimary}>
                {tx ? formatCurrency(tx.amount, currency) : '—'}
              </AppText>
              {tx?.note && (
                <AppText variant="body" color={Colors.textSecondary} style={{ marginTop: 2 }}>
                  {tx.note}
                </AppText>
              )}
            </View>

            <View style={[
              styles.statusBadge,
              isFullySettled ? styles.statusBadgeSettled : styles.statusBadgePending,
            ]}>
              <Ionicons
                name={isFullySettled ? 'checkmark-circle' : 'time-outline'}
                size={14}
                color={isFullySettled ? Colors.income : Colors.expense}
              />
              <AppText
                variant="caption"
                color={isFullySettled ? Colors.income : Colors.expense}
                style={{ fontWeight: '700', marginLeft: 4 }}
              >
                {isFullySettled ? 'Settled' : 'Pending'}
              </AppText>
            </View>
          </View>

          {/* Progress bar */}
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <AppText variant="caption" color={Colors.textSecondary}>
                Collected: {formatCurrency(totalPaid, currency)}
              </AppText>
              <AppText variant="caption" color={Colors.textSecondary}>
                Owed: {formatCurrency(remainingOwed, currency)}
              </AppText>
            </View>
            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${totalOwed > 0 ? Math.min(100, (totalPaid / totalOwed) * 100) : 0}%` },
                ]}
              />
            </View>
          </View>
        </GlassCard>

        {/* Participants list card */}
        <GlassCard padding={18} style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="h3">Participants</AppText>
            {!isFullySettled && participants.length > 0 && (
              <Pressable onPress={handleSettleAll} hitSlop={8}>
                <AppText variant="captionStrong" color={Colors.primary}>
                  Settle All
                </AppText>
              </Pressable>
            )}
          </View>

          <View style={styles.participantsList}>
            {participants.map(p => {
              const isPaid = p.status === 'paid';

              return (
                <View key={p.id} style={styles.participantItem}>
                  <View style={[styles.avatar, isPaid && styles.avatarPaid]}>
                    <Ionicons
                      name={isPaid ? 'checkmark' : 'person-outline'}
                      size={16}
                      color={isPaid ? Colors.income : Colors.textSecondary}
                    />
                  </View>

                  <View style={styles.participantInfo}>
                    <AppText variant="bodyStrong" numberOfLines={1}>{p.name}</AppText>
                    <AppText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
                      {isPaid
                        ? `Paid in full (${formatCurrency(p.shareAmount, currency)})`
                        : `Owes ${formatCurrency(p.shareAmount, currency)}`}
                    </AppText>
                  </View>

                  {!isPaid ? (
                    <AppButton
                      title="Mark as Paid"
                      size="sm"
                      variant="glass"
                      fullWidth={false}
                      onPress={() => confirmMarkPaid(p)}
                      disabled={payingId === p.id}
                    />
                  ) : (
                    <View style={styles.paidBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={Colors.income} />
                      <AppText variant="captionStrong" color={Colors.income} style={{ marginLeft: 4 }}>
                        Paid
                      </AppText>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </GlassCard>
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 80,
    gap: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    gap: Spacing.lg,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
  },
  statusBadgeSettled: {
    backgroundColor: Colors.incomeSoft,
  },
  statusBadgePending: {
    backgroundColor: Colors.expenseSoft,
  },
  progressBarTrack: {
    height: 6,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.track,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.income,
    borderRadius: BorderRadius.pill,
  },
  participantsList: {
    gap: Spacing.sm,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
  },
  participantInfo: {
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.controlBg,
  },
  avatarPaid: {
    backgroundColor: Colors.incomeSoft,
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.incomeSoft,
  },
});
