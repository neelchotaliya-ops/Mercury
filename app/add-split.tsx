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
import { createSplitExpense } from '@/db/splits';

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

      // Atomic creation of transaction + split participants
      const nonYouParticipants = participants
        .map((p, idx) => ({ ...p, share: shares[idx] }))
        .filter(p => !p.isYou);

      await createSplitExpense(
        db,
        {
          id: transactionId,
          type: 'expense',
          amount: numericTotal,
          accountId,
          categoryId,
          payee: payee.trim() || undefined,
          note: note.trim() || (payee ? `Split: ${payee}` : 'Shared Expense'),
          date: date.toISOString(),
        },
        nonYouParticipants.map(p => ({
          name: p.name,
          shareAmount: p.share,
          note: note.trim() || undefined,
        }))
      );

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
  const currency = state.settings.currency ?? 'INR';
  const youShare = shares[0] ?? 0;
  const othersShare = shares.slice(1).reduce((a, b) => a + b, 0);

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader title="Split Expense" onClose={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        {/* Hero Bill Amount Card */}
        <GlassCard strong elevated padding={18} style={styles.heroAmountCard}>
          <AppText variant="micro" color={Colors.textMuted} style={styles.heroAmountLabel}>
            TOTAL BILL TO SPLIT
          </AppText>
          <View style={styles.heroAmountRow}>
            <AppText variant="h1" color={Colors.expense} style={styles.heroCurrencySymbol}>
              {currencySymbol}
            </AppText>
            <TextInput
              value={totalAmountText}
              onChangeText={setTotalAmountText}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              autoFocus={!params.amount}
              style={styles.heroAmountInput}
            />
          </View>
        </GlassCard>

        {/* Bill Metadata Card */}
        <GlassCard padding={18} style={styles.card}>
          <AppText variant="h3">Bill Details</AppText>

          {/* Merchant / Description */}
          <View style={styles.field}>
            <AppText variant="micro" color={Colors.textMuted}>DESCRIPTION / MERCHANT</AppText>
            <View style={styles.inputRow}>
              <Ionicons name="receipt-outline" size={18} color={Colors.primary} />
              <TextInput
                value={payee}
                onChangeText={setPayee}
                placeholder="e.g. Dinner at Olive Bistro, Airbnb Goa"
                placeholderTextColor={Colors.textMuted}
                style={styles.textInput}
              />
            </View>
          </View>

          {/* Date & Quick Meta Row */}
          <View style={styles.field}>
            <AppText variant="micro" color={Colors.textMuted}>DATE</AppText>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={styles.datePickerBtn}
            >
              <Ionicons name="calendar-outline" size={17} color={Colors.primary} />
              <AppText variant="bodyStrong">
                {date.toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </AppText>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
            </Pressable>
          </View>

          {/* Paid From Account */}
          <View style={styles.field}>
            <AppText variant="micro" color={Colors.textMuted}>PAID FROM ACCOUNT</AppText>
            <AccountPicker
              accounts={state.accounts}
              selectedId={accountId}
              onSelect={a => setAccountId(a.id)}
            />
          </View>

          {/* Category */}
          <View style={styles.field}>
            <AppText variant="micro" color={Colors.textMuted}>CATEGORY</AppText>
            <CategoryPicker
              categories={expenseCategories}
              selectedId={categoryId}
              onSelect={c => setCategoryId(c.id)}
              onManage={() => router.push('/manage-categories?kind=expense')}
            />
          </View>
        </GlassCard>

        {/* Split Participants Card */}
        <GlassCard padding={18} style={styles.card}>
          <SplitParticipantFields form={splitForm} currency={currency} />
        </GlassCard>

        {/* Live Breakdown Summary Card */}
        {numericTotal > 0 && participants.length > 1 && (
          <GlassCard padding={18} style={styles.breakdownCard}>
            <View style={styles.breakdownHeader}>
              <View style={styles.breakdownIconWrap}>
                <Ionicons name="people" size={16} color={Colors.primaryDeep} />
              </View>
              <AppText variant="bodyStrong" color={Colors.primaryDeep}>
                Split Summary
              </AppText>
            </View>

            <View style={styles.breakdownRow}>
              <View style={styles.breakdownItem}>
                <AppText variant="micro" color={Colors.textMuted}>TOTAL BILL</AppText>
                <AppText variant="bodyStrong" color={Colors.textPrimary}>
                  {formatCurrency(numericTotal, currency)}
                </AppText>
              </View>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownItem}>
                <AppText variant="micro" color={Colors.textMuted}>YOUR SHARE</AppText>
                <AppText variant="bodyStrong" color={Colors.primaryDeep}>
                  {formatCurrency(youShare, currency)}
                </AppText>
              </View>
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownItem}>
                <AppText variant="micro" color={Colors.textMuted}>YOU'LL COLLECT</AppText>
                <AppText variant="bodyStrong" color={Colors.income}>
                  +{formatCurrency(othersShare, currency)}
                </AppText>
              </View>
            </View>

            <AppText variant="caption" color={Colors.textSecondary} style={styles.breakdownFooterText}>
              You will collect {formatCurrency(othersShare, currency)} from {participants.length - 1}{' '}
              {participants.length === 2 ? 'person' : 'people'}.
            </AppText>
          </GlassCard>
        )}

        <AppButton
          title={
            !numericTotal
              ? 'Enter Bill Amount'
              : participants.length <= 1
              ? 'Add at Least 1 Person'
              : !canSave
              ? 'Balance Total to Save'
              : `Create Split · ${formatCurrency(numericTotal, currency)}`
          }
          size="lg"
          onPress={handleSave}
          disabled={!canSave}
          style={styles.submitBtn}
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
    paddingHorizontal: 20,
    paddingBottom: 60,
    gap: Spacing.lg,
  },
  heroAmountCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: BorderRadius.lg,
  },
  heroAmountLabel: {
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  heroCurrencySymbol: {
    fontSize: 28,
    fontFamily: 'Sora_700Bold',
    marginRight: 2,
  },
  heroAmountInput: {
    fontSize: 36,
    fontFamily: 'Sora_700Bold',
    color: Colors.textPrimary,
    minWidth: 120,
    textAlign: 'center',
    paddingVertical: 2,
  },
  card: {
    gap: Spacing.md,
  },
  field: {
    gap: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: ControlHeights.md,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceOpaque,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: ControlHeights.md,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceOpaque,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  breakdownCard: {
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownIconWrap: {
    width: 26,
    height: 26,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  breakdownDivider: {
    width: 1,
    height: 24,
    backgroundColor: Colors.divider,
  },
  breakdownFooterText: {
    textAlign: 'center',
    marginTop: 2,
  },
  submitBtn: {
    marginTop: 6,
    marginBottom: 20,
  },
});
