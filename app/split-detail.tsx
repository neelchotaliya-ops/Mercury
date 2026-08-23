import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { AccountPicker } from '@/components/finance/account-picker';
import { useFinance } from '@/context/finance-context';
import { SplitParticipant, Transaction } from '@/types/finance';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import { haptics } from '@/utils/haptics';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { getTransactionById } from '@/db/transactions';
import { listSplitParticipants, recordRepayment } from '@/db/splits';

export default function SplitDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { state } = useFinance();

  const [tx, setTx] = useState<Transaction | null>(null);
  const [participants, setParticipants] = useState<SplitParticipant[]>([]);
  const [loading, setLoading] = useState(true);

  // Repayment modal state
  const [settlingParticipant, setSettlingParticipant] = useState<SplitParticipant | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [receivingAccountId, setReceivingAccountId] = useState<string | undefined>(
    state.accounts[0]?.id
  );
  const [repayNote, setRepayNote] = useState('');

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
      if (fetchedTx?.accountId) {
        setReceivingAccountId(fetchedTx.accountId);
      }
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currency = state.settings.currency ?? 'INR';
  const currencySymbol = getCurrencySymbol(currency);

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

  const openRepaymentModal = (p: SplitParticipant) => {
    const remaining = p.shareAmount - p.paidAmount;
    setSettlingParticipant(p);
    setRepayAmount(String(Math.max(0, remaining)));
    setRepayNote(`Repayment from ${p.name}`);
  };

  const handleConfirmRepayment = async () => {
    if (!settlingParticipant || !receivingAccountId) return;
    const numericAmt = parseFloat(repayAmount || '0');
    if (numericAmt <= 0) return;

    try {
      const db = await getDb();
      await recordRepayment(db, {
        participantId: settlingParticipant.id,
        amount: numericAmt,
        accountId: receivingAccountId,
        note: repayNote.trim() || undefined,
      });

      haptics.success();
      setSettlingParticipant(null);
      await loadData();
    } catch {
      Alert.alert('Error', 'Failed to record repayment.');
    }
  };

  const handleSettleAll = () => {
    const pendingParticipants = participants.filter(p => p.status !== 'paid');
    if (pendingParticipants.length === 0) return;

    Alert.alert(
      'Settle All Remaining',
      `Mark all remaining ₹${remainingOwed.toLocaleString()} as paid?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Settle All',
          style: 'default',
          onPress: async () => {
            try {
              const db = await getDb();
              const accId = tx?.accountId ?? state.accounts[0]?.id;
              if (!accId) return;

              for (const p of pendingParticipants) {
                const remaining = p.shareAmount - p.paidAmount;
                if (remaining > 0) {
                  await recordRepayment(db, {
                    participantId: p.id,
                    amount: remaining,
                    accountId: accId,
                    note: `Full settlement from ${p.name}`,
                  });
                }
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
              <AppText variant="h2" style={{ fontSize: 26, fontWeight: '700', color: Colors.textPrimary }}>
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
                <AppText variant="caption" color={Colors.primary} style={{ fontWeight: '700' }}>
                  Settle All
                </AppText>
              </Pressable>
            )}
          </View>

          <View style={styles.participantsList}>
            {participants.map(p => {
              const isPaid = p.status === 'paid';
              const remaining = Math.max(0, p.shareAmount - p.paidAmount);

              return (
                <View key={p.id} style={styles.participantItem}>
                  <View style={[styles.avatar, isPaid && styles.avatarPaid]}>
                    <Ionicons
                      name={isPaid ? 'checkmark' : 'person-outline'}
                      size={16}
                      color={isPaid ? Colors.income : Colors.textSecondary}
                    />
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <AppText variant="bodyStrong">{p.name}</AppText>
                    <AppText variant="caption" color={Colors.textSecondary}>
                      {isPaid
                        ? `Paid in full (${formatCurrency(p.shareAmount, currency)})`
                        : `${formatCurrency(p.paidAmount, currency)} of ${formatCurrency(p.shareAmount, currency)} paid`}
                    </AppText>
                  </View>

                  {!isPaid ? (
                    <AppButton
                      title={`Collect ${formatCurrency(remaining, currency)}`}
                      size="sm"
                      variant="glass"
                      onPress={() => openRepaymentModal(p)}
                    />
                  ) : (
                    <View style={styles.paidBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={Colors.income} />
                      <AppText variant="caption" color={Colors.income} style={{ fontWeight: '600', marginLeft: 4 }}>
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

      {/* Record Repayment Modal */}
      {settlingParticipant && (
        <Modal
          visible={!!settlingParticipant}
          transparent
          animationType="fade"
          onRequestClose={() => setSettlingParticipant(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <AppText variant="h3">
                  Record Payment from {settlingParticipant.name}
                </AppText>
                <Pressable onPress={() => setSettlingParticipant(null)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={Colors.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.field}>
                <AppText variant="label">Repayment Amount</AppText>
                <View style={styles.amountInputRow}>
                  <AppText variant="h2" color={Colors.income}>{currencySymbol}</AppText>
                  <TextInput
                    value={repayAmount}
                    onChangeText={setRepayAmount}
                    placeholder="0.00"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="decimal-pad"
                    autoFocus
                    style={styles.amountInput}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <AppText variant="label">Deposit To Account</AppText>
                <AccountPicker
                  accounts={state.accounts}
                  selectedId={receivingAccountId}
                  onSelect={a => setReceivingAccountId(a.id)}
                />
              </View>

              <View style={styles.field}>
                <AppText variant="label">Note (Optional)</AppText>
                <TextInput
                  value={repayNote}
                  onChangeText={setRepayNote}
                  placeholder="e.g. UPI transfer"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.input}
                />
              </View>

              <View style={styles.modalActions}>
                <AppButton
                  title="Cancel"
                  variant="glass"
                  size="md"
                  onPress={() => setSettlingParticipant(null)}
                  style={{ flex: 1 }}
                />
                <AppButton
                  title="Confirm Payment"
                  size="md"
                  onPress={handleConfirmRepayment}
                  disabled={!parseFloat(repayAmount) || !receivingAccountId}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          </View>
        </Modal>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: Spacing.md,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    gap: Spacing.md,
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
    borderRadius: 3,
    backgroundColor: Colors.track,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.income,
    borderRadius: 3,
  },
  participantsList: {
    gap: 10,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: 20,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 15,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  field: {
    gap: 8,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    gap: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontFamily: 'Sora_700Bold',
    color: Colors.textPrimary,
    padding: 0,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
});
