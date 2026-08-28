import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { CategoryPicker } from '@/components/finance/category-picker';
import { AccountPicker } from '@/components/finance/account-picker';
import { DatePickerModal } from '@/components/finance/date-picker-modal';
import { useFinance } from '@/context/finance-context';
import { getCurrencySymbol, formatCurrency } from '@/utils/currency';
import { haptics } from '@/utils/haptics';
import { generateId } from '@/utils/id';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { insertTransaction } from '@/db/transactions';
import { insertSplitParticipantsBatch } from '@/db/splits';
import { calculateSplitShares, SplitMethod } from '@/utils/bank-statement';

import { bumpDataVersion } from '@/db/version';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY_FRIENDS = '@mercury/recent_split_friends';

interface ParticipantEntry {
  id: string;
  name: string;
  isYou: boolean;
  value: string; // amount or % string depending on method
}

export default function AddSplitScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    amount?: string;
    accountId?: string;
    categoryId?: string;
    payee?: string;
    note?: string;
  }>();
  const { state } = useFinance();

  const [totalAmount, setTotalAmount] = useState(params.amount ?? '');
  const [accountId, setAccountId] = useState<string | undefined>(
    params.accountId ?? state.accounts[0]?.id
  );
  const [categoryId, setCategoryId] = useState<string | undefined>(params.categoryId);
  const [payee, setPayee] = useState(params.payee ?? '');
  const [note, setNote] = useState(params.note ?? '');
  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [method, setMethod] = useState<SplitMethod>('equal');
  const [newParticipantName, setNewParticipantName] = useState('');
  const [recentFriends, setRecentFriends] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_FRIENDS).then(val => {
      if (val) {
        try { setRecentFriends(JSON.parse(val)); } catch {}
      }
    });
  }, []);

  const [participants, setParticipants] = useState<ParticipantEntry[]>([
    { id: 'you', name: 'You', isYou: true, value: '' },
    { id: 'p1', name: 'Friend 1', isYou: false, value: '' },
  ]);

  const expenseCategories = useMemo(
    () => state.categories.filter(c => c.kind === 'expense'),
    [state.categories]
  );

  const numericTotal = parseFloat(totalAmount || '0');

  // Compute calculated shares for each participant
  const shares = useMemo<number[]>(() => {
    if (numericTotal <= 0 || participants.length === 0) {
      return participants.map(() => 0);
    }
    try {
      if (method === 'equal') {
        return calculateSplitShares(numericTotal, 'equal', participants.length);
      }
      if (method === 'percentage') {
        const rawValues = participants.map(p => parseFloat(p.value || '0'));
        return calculateSplitShares(numericTotal, 'percentage', participants.length, rawValues);
      }
      if (method === 'custom') {
        const rawValues = participants.map(p => parseFloat(p.value || '0'));
        return calculateSplitShares(numericTotal, 'custom', participants.length, rawValues);
      }
    } catch {
      return participants.map(() => 0);
    }
    return participants.map(() => 0);
  }, [numericTotal, method, participants]);

  const sharesSum = useMemo(() => shares.reduce((a, b) => a + b, 0), [shares]);
  const isBalanced = Math.abs(sharesSum - numericTotal) < 0.05;

  const canSave = numericTotal > 0 && !!accountId && participants.length >= 2 && (method === 'equal' || isBalanced);

  const addParticipant = (nameToAdd?: string) => {
    const name = (nameToAdd || newParticipantName).trim();
    if (!name) return;
    if (participants.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      setNewParticipantName('');
      return;
    }
    haptics.press();
    setParticipants(prev => [
      ...prev,
      { id: generateId(), name, isYou: false, value: '' },
    ]);
    setNewParticipantName('');

    const updated = [name, ...recentFriends.filter(f => f.toLowerCase() !== name.toLowerCase())].slice(0, 8);
    setRecentFriends(updated);
    AsyncStorage.setItem(STORAGE_KEY_FRIENDS, JSON.stringify(updated)).catch(() => {});
  };

  const removeParticipant = (id: string) => {
    if (participants.length <= 2) {
      Alert.alert('Minimum Participants', 'A split requires at least 2 people.');
      return;
    }
    haptics.press();
    setParticipants(prev => prev.filter(p => p.id !== id));
  };

  const updateParticipantValue = (id: string, val: string) => {
    setParticipants(prev =>
      prev.map(p => (p.id === id ? { ...p, value: val } : p))
    );
  };

  const handleSave = async () => {
    if (!canSave || !accountId) return;

    try {
      const db = await getDb();
      const transactionId = generateId();
      const dateStr = date.toISOString().slice(0, 10);

      // 1. Create the main expense transaction for the whole amount
      await insertTransaction(db, {
        id: transactionId,
        type: 'expense',
        amount: numericTotal,
        accountId,
        categoryId,
        payee: payee.trim() || undefined,
        note: note.trim() || (payee ? `Split: ${payee}` : 'Shared Expense'),
        date: dateStr,
      });

      // 2. Create the split participant entries (excluding 'You' since You already paid)
      const nonYouParticipants = participants
        .map((p, idx) => ({ ...p, share: shares[idx] }))
        .filter(p => !p.isYou);

      await insertSplitParticipantsBatch(
        db,
        nonYouParticipants.map(p => ({
          transactionId,
          name: p.name,
          shareAmount: p.share,
          note: note.trim() || undefined,
        }))
      );

      await bumpDataVersion();
      haptics.success();
      router.replace({
        pathname: '/split-detail' as any,
        params: { id: transactionId },
      });
    } catch {
      Alert.alert('Error', 'Failed to save split expense.');
    }
  };

  const currencySymbol = getCurrencySymbol(state.settings.currency ?? 'INR');

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader title="Split Expense" onClose={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        {/* Bill Overview Card */}
        <GlassCard padding={18} style={styles.card}>
          <AppText variant="h3">Expense Details</AppText>

          <View style={styles.field}>
            <AppText variant="label">Total Bill Amount</AppText>
            <View style={styles.amountInputRow}>
              <AppText variant="h2" color={Colors.expense}>
                {currencySymbol}
              </AppText>
              <TextInput
                value={totalAmount}
                onChangeText={setTotalAmount}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.amountInput}
              />
            </View>
          </View>

          <View style={styles.field}>
            <AppText variant="label">Paid From Account</AppText>
            <AccountPicker
              accounts={state.accounts}
              selectedId={accountId}
              onSelect={a => setAccountId(a.id)}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="label">Category</AppText>
            <CategoryPicker
              categories={expenseCategories}
              selectedId={categoryId}
              onSelect={c => setCategoryId(c.id)}
              onManage={() => router.push('/manage-categories?kind=expense')}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="label">Description / Merchant</AppText>
            <TextInput
              value={payee}
              onChangeText={setPayee}
              placeholder="e.g. Olive Bistro, AirBnB Goa"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="label">Date</AppText>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={styles.datePickerBtn}
            >
              <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
              <AppText variant="bodyStrong">
                {date.toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </AppText>
            </Pressable>
          </View>
        </GlassCard>

        {/* Split Breakdown Card */}
        <GlassCard padding={18} style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="h3">Split Method</AppText>
            <AppText variant="caption" color={Colors.primaryDeep} style={{ fontWeight: '700' }}>
              {participants.length} people
            </AppText>
          </View>

          <SegmentedControl<SplitMethod>
            options={[
              { key: 'equal', label: 'Equally' },
              { key: 'custom', label: 'Exact ₹' },
              { key: 'percentage', label: 'Percent %' },
            ]}
            value={method}
            onChange={m => {
              setMethod(m);
              setParticipants(prev => prev.map(p => ({ ...p, value: '' })));
            }}
          />

          {/* Add participant input */}
          <View style={styles.addParticipantRow}>
            <TextInput
              value={newParticipantName}
              onChangeText={setNewParticipantName}
              placeholder="Add person (e.g. Rahul, Priya)"
              placeholderTextColor={Colors.textMuted}
              onSubmitEditing={() => addParticipant()}
              style={[styles.input, { flex: 1 }]}
            />
            <AppButton
              title="+ Add"
              size="sm"
              fullWidth={false}
              onPress={() => addParticipant()}
              disabled={!newParticipantName.trim()}
              style={styles.addParticipantBtn}
            />
          </View>

          {/* Quick recent friends chips */}
          {recentFriends.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4 }}>
              <AppText variant="micro" color={Colors.textMuted}>Quick add:</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {recentFriends
                  .filter(f => !participants.some(p => p.name.toLowerCase() === f.toLowerCase()))
                  .map(friend => (
                    <Pressable
                      key={friend}
                      onPress={() => addParticipant(friend)}
                      style={styles.recentFriendChip}
                    >
                      <Ionicons name="add-circle-outline" size={13} color={Colors.primary} />
                      <AppText variant="caption" color={Colors.primaryDeep} style={{ fontWeight: '600' }}>
                        {friend}
                      </AppText>
                    </Pressable>
                  ))}
              </ScrollView>
            </View>
          )}

          {/* Participant list */}
          <View style={styles.participantsList}>
            {participants.map((p, idx) => {
              const calculatedShare = shares[idx] ?? 0;
              return (
                <View key={p.id} style={styles.participantItem}>
                  <View style={styles.avatar}>
                    <Ionicons
                      name={p.isYou ? 'person' : 'person-outline'}
                      size={16}
                      color={p.isYou ? Colors.primaryDeep : Colors.textSecondary}
                    />
                  </View>

                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <AppText variant="bodyStrong">
                      {p.name} {p.isYou && '(You)'}
                    </AppText>
                    <AppText variant="caption" color={Colors.textSecondary}>
                      Share: {formatCurrency(calculatedShare, state.settings.currency ?? 'INR')}
                    </AppText>
                  </View>

                  {method !== 'equal' && (
                    <TextInput
                      value={p.value}
                      onChangeText={val => updateParticipantValue(p.id, val)}
                      placeholder={method === 'percentage' ? '%' : '₹'}
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      style={styles.customShareInput}
                    />
                  )}

                  {!p.isYou && (
                    <Pressable
                      onPress={() => removeParticipant(p.id)}
                      hitSlop={8}
                      style={{ marginLeft: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>

          {/* Balance summary footer for non-equal splits */}
          {method !== 'equal' && numericTotal > 0 && (
            <View style={[
              styles.balanceBanner,
              isBalanced ? styles.balanceBannerOk : styles.balanceBannerWarn,
            ]}>
              <Ionicons
                name={isBalanced ? 'checkmark-circle' : 'alert-circle'}
                size={16}
                color={isBalanced ? Colors.income : Colors.expense}
              />
              <AppText variant="caption" color={isBalanced ? Colors.income : Colors.expense} style={{ fontWeight: '600', flex: 1 }}>
                {isBalanced
                  ? 'All shares add up to total bill amount'
                  : `Total assigned: ${formatCurrency(sharesSum, state.settings.currency ?? 'INR')} of ${formatCurrency(numericTotal, state.settings.currency ?? 'INR')}`}
              </AppText>
            </View>
          )}
        </GlassCard>

        {/* You will be owed summary */}
        {numericTotal > 0 && participants.length > 1 && (
          <GlassCard padding={16} style={[styles.card, styles.owedCard]}>
            <Ionicons name="cash-outline" size={22} color={Colors.income} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <AppText variant="caption" color={Colors.textSecondary}>You will be owed</AppText>
              <AppText variant="h2" color={Colors.income}>
                {formatCurrency(
                  shares.slice(1).reduce((a, b) => a + b, 0),
                  state.settings.currency ?? 'INR'
                )}
              </AppText>
            </View>
            <AppText variant="caption" color={Colors.textMuted}>
              from {participants.length - 1} {participants.length === 2 ? 'person' : 'people'}
            </AppText>
          </GlassCard>
        )}

        <AppButton
          title="Create Split Expense"
          size="md"
          onPress={handleSave}
          disabled={!canSave}
          style={{ marginTop: 4, marginBottom: 20 }}
        />
      </ScrollView>

      <DatePickerModal
        visible={showDatePicker}
        selectedDate={date}
        onSelectDate={setDate}
        onClose={() => setShowDatePicker(false)}
      />
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 80,
    gap: Spacing.md,
  },
  card: {
    gap: Spacing.md,
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
    fontSize: 24,
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
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  addParticipantRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  addParticipantBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
  },
  recentFriendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
  },
  participantsList: {
    gap: 8,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.controlBg,
  },
  customShareInput: {
    width: 76,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.xs,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: Colors.textPrimary,
    textAlign: 'right',
  },
  balanceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
  },
  balanceBannerOk: {
    backgroundColor: Colors.incomeSoft,
  },
  balanceBannerWarn: {
    backgroundColor: Colors.expenseSoft,
  },
  owedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46, 169, 124, 0.08)',
    borderColor: 'rgba(46, 169, 124, 0.25)',
  },
});
