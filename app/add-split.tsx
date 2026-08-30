import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { CategoryPicker } from '@/components/finance/category-picker';
import { AccountPicker } from '@/components/finance/account-picker';
import { DatePickerModal } from '@/components/finance/date-picker-modal';
import { SplitParticipantFields } from '@/components/finance/split-participant-fields';
import { useSplitForm } from '@/hooks/use-split-form';
import { useFinance } from '@/context/finance-context';
import { getCurrencySymbol, formatCurrency } from '@/utils/currency';
import { haptics } from '@/utils/haptics';
import { generateId } from '@/utils/id';
import { Colors, BorderRadius, ControlHeights, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { insertTransaction } from '@/db/transactions';
import { insertSplitParticipantsBatch } from '@/db/splits';
import { bumpDataVersion } from '@/db/version';

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

  const [accountId, setAccountId] = useState<string | undefined>(
    params.accountId ?? state.accounts[0]?.id
  );
  const [categoryId, setCategoryId] = useState<string | undefined>(params.categoryId);
  const [payee, setPayee] = useState(params.payee ?? '');
  const [note, setNote] = useState(params.note ?? '');
  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const splitForm = useSplitForm({ initialTotalText: params.amount });
  const { totalAmountText, setTotalAmountText, numericTotal, participants, shares, canSubmit } = splitForm;

  const expenseCategories = useMemo(
    () => state.categories.filter(c => c.kind === 'expense'),
    [state.categories]
  );

  const canSave = canSubmit && !!accountId;

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
                value={totalAmountText}
                onChangeText={setTotalAmountText}
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

        {/* Split Participants Card */}
        <GlassCard padding={18} style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="h3">Split With</AppText>
            <AppText variant="captionStrong" color={Colors.primaryDeep}>
              {participants.length} people
            </AppText>
          </View>

          <SplitParticipantFields form={splitForm} currency={state.settings.currency ?? 'INR'} />
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
          size="lg"
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
    height: ControlHeights.lg,
    paddingHorizontal: 16,
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
    height: ControlHeights.lg,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    fontSize: 15,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: ControlHeights.lg,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  owedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46, 169, 124, 0.08)',
    borderColor: 'rgba(46, 169, 124, 0.25)',
  },
});
