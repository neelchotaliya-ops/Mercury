import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { AmountDisplay, Numpad } from '@/components/finance/amount-input';
import { CategoryPicker } from '@/components/finance/category-picker';
import { AccountPicker } from '@/components/finance/account-picker';
import { ScanReceiptButton } from '@/components/finance/scan-receipt-button';
import { useFinance } from '@/context/finance-context';
import { TransactionType } from '@/types/finance';
import { getCurrencySymbol } from '@/utils/currency';
import { haptics } from '@/utils/haptics';
import { buildNote } from '@/utils/receipt-parser';
import { guessAccount, guessCategory } from '@/utils/receipt-match';
import {
  ScanResult,
  captureAndScan,
  describeScanFailure,
  isScanSupported,
  pickAndScan,
  scanImage,
} from '@/utils/receipt-scan';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

const TYPE_COLOR: Record<TransactionType, string> = {
  expense: Colors.expense,
  income: Colors.income,
  transfer: Colors.primary,
};

export default function AddTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    type?: string;
    imageUri?: string;
    scan?: string;
  }>();
  const { state, addTransaction, updateTransaction, deleteTransaction } = useFinance();

  const editing = useMemo(
    () => state.transactions.find(t => t.id === params.id),
    [state.transactions, params.id]
  );

  const [type, setType] = useState<TransactionType>(
    editing?.type ??
      (params.type === 'transfer' || params.type === 'income'
        ? (params.type as TransactionType)
        : 'expense')
  );
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [accountId, setAccountId] = useState<string | undefined>(
    editing?.accountId ?? state.accounts[0]?.id
  );
  const [toAccountId, setToAccountId] = useState<string | undefined>(editing?.toAccountId);
  const [categoryId, setCategoryId] = useState<string | undefined>(editing?.categoryId);
  const [note, setNote] = useState(editing?.note ?? '');
  const [date, setDate] = useState<Date>(editing ? new Date(editing.date) : new Date());

  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<{ merchant?: string; confidence: number } | null>(null);

  const categories = state.categories.filter(
    c => c.kind === (type === 'income' ? 'income' : 'expense')
  );

  /**
   * Applies a scan to the form. Nothing is saved here — the fields are filled
   * in and the user still has to confirm, so a misread never lands silently.
   */
  const applyScanResult = useCallback(
    (result: ScanResult) => {
      if (result.status !== 'ok') {
        if (result.status !== 'canceled') {
          Alert.alert('Scan', describeScanFailure(result));
        }
        return;
      }

      const receipt = result.receipt;
      const nextType: TransactionType = receipt.direction;
      const kind = nextType === 'income' ? 'income' : 'expense';

      setType(nextType);
      if (receipt.amount !== undefined) {
        setAmount(String(Number(receipt.amount.toFixed(2))));
      }
      if (receipt.date) setDate(receipt.date);

      const scannedNote = buildNote(receipt);
      if (scannedNote) setNote(scannedNote);

      // Category list is keyed off the new type, so always reassign it.
      setCategoryId(guessCategory(receipt, state.categories, kind)?.id);

      const matchedAccount = guessAccount(receipt, state.accounts);
      if (matchedAccount) setAccountId(matchedAccount.id);

      setScanned({ merchant: receipt.merchant, confidence: receipt.confidence });
      haptics.success();
    },
    [state.accounts, state.categories]
  );

  const runScan = useCallback(
    async (scan: () => Promise<ScanResult>) => {
      setScanning(true);
      try {
        applyScanResult(await scan());
      } finally {
        setScanning(false);
      }
    },
    [applyScanResult]
  );

  // A screenshot shared into Mercury arrives as a URI param; scan it on entry.
  const handledImageRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const uri = params.imageUri;
    if (!uri || handledImageRef.current === uri) return;
    handledImageRef.current = uri;
    runScan(() => scanImage(uri));
  }, [params.imageUri, runScan]);

  // The home screen widget's Scan shortcut opens the picker straight away.
  const autoPickedRef = useRef(false);
  useEffect(() => {
    if (params.scan !== '1' || autoPickedRef.current || !isScanSupported()) return;
    autoPickedRef.current = true;
    runScan(pickAndScan);
  }, [params.scan, runScan]);
  const numericAmount = parseFloat(amount || '0');

  const canSave =
    numericAmount > 0 &&
    !!accountId &&
    (type !== 'transfer' ? !!categoryId : !!toAccountId && toAccountId !== accountId);

  const shiftDay = (delta: number) =>
    setDate(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta);
      return next;
    });

  const handleSave = () => {
    if (!canSave || !accountId) return;
    const payload = {
      type,
      amount: numericAmount,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      categoryId: type !== 'transfer' ? categoryId : undefined,
      date: date.toISOString(),
      note: note.trim() || undefined,
    };

    if (editing) updateTransaction({ ...editing, ...payload });
    else addTransaction(payload);
    haptics.success();
    router.back();
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert('Delete transaction', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTransaction(editing.id);
          haptics.warning();
          router.back();
        },
      },
    ]);
  };

  const isToday = new Date().toDateString() === date.toDateString();

  return (
    <GradientScreen edges={['top']} contours="top">
      <ModalHeader
        title={editing ? 'Edit transaction' : 'New transaction'}
        onClose={() => router.back()}
        onDelete={editing ? handleDelete : undefined}
      />

      <View style={styles.screenBody}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!editing && isScanSupported() ? (
            <ScanReceiptButton
              scanning={scanning}
              onPickImage={() => runScan(pickAndScan)}
              onOpenCamera={() => runScan(captureAndScan)}
            />
          ) : null}

          {scanned ? (
            <View style={styles.scanBanner}>
              <Ionicons
                name={scanned.confidence >= 0.7 ? 'checkmark-circle' : 'alert-circle'}
                size={17}
                color={scanned.confidence >= 0.7 ? Colors.income : Colors.expense}
              />
              <AppText variant="micro" style={styles.scanBannerText}>
                {scanned.confidence >= 0.7
                  ? `Read from screenshot${scanned.merchant ? ` · ${scanned.merchant}` : ''}. Check the details, then save.`
                  : 'Only part of that screenshot was readable — please check every field before saving.'}
              </AppText>
              <Pressable onPress={() => setScanned(null)} hitSlop={10}>
                <Ionicons name="close" size={15} color={Colors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          <SegmentedControl<TransactionType>
            options={[
              { key: 'expense', label: 'Expense', activeColor: Colors.expense },
              { key: 'income', label: 'Income', activeColor: Colors.income },
              { key: 'transfer', label: 'Transfer', activeColor: Colors.primary },
            ]}
            value={type}
            onChange={next => {
              setType(next);
              setCategoryId(undefined);
            }}
          />

          <GlassCard strong style={styles.amountCard} elevated>
            <AmountDisplay
              value={amount}
              currencySymbol={getCurrencySymbol(state.settings.currency)}
              accentColor={TYPE_COLOR[type]}
            />
          </GlassCard>

          <GlassCard style={styles.formCard} padding={18}>
            <View style={styles.field}>
              <AppText variant="label">{type === 'transfer' ? 'From' : 'Account'}</AppText>
              <AccountPicker
                accounts={state.accounts}
                selectedId={accountId}
                onSelect={a => setAccountId(a.id)}
              />
            </View>

            {type === 'transfer' ? (
              <View style={styles.field}>
                <AppText variant="label">To</AppText>
                <AccountPicker
                  accounts={state.accounts}
                  selectedId={toAccountId}
                  onSelect={a => setToAccountId(a.id)}
                  excludeId={accountId}
                />
              </View>
            ) : (
              <View style={styles.field}>
                <AppText variant="label">Category</AppText>
                <CategoryPicker
                  categories={categories}
                  selectedId={categoryId}
                  onSelect={c => setCategoryId(c.id)}
                  onManage={() =>
                    router.push(`/manage-categories?kind=${type === 'income' ? 'income' : 'expense'}`)
                  }
                />
              </View>
            )}

            <View style={styles.field}>
              <AppText variant="label">Date</AppText>
              <View style={styles.dateRow}>
                <Pressable onPress={() => shiftDay(-1)} hitSlop={10} style={styles.dateArrow}>
                  <Ionicons name="chevron-back" size={17} color={Colors.textSecondary} />
                </Pressable>
                <View style={styles.dateLabel}>
                  <AppText variant="bodyStrong" align="center">
                    {isToday
                      ? 'Today'
                      : date.toLocaleDateString(undefined, {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                  </AppText>
                </View>
                <Pressable
                  onPress={() => shiftDay(1)}
                  hitSlop={10}
                  disabled={isToday}
                  style={[styles.dateArrow, isToday && styles.dateArrowDisabled]}
                >
                  <Ionicons name="chevron-forward" size={17} color={Colors.textSecondary} />
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <AppText variant="label">Note</AppText>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Optional"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
              />
            </View>
          </GlassCard>
        </ScrollView>

        <View style={styles.fixedBottomContainer}>
          <Numpad value={amount} onChangeValue={setAmount} />
          <AppButton
            title={editing ? 'Save changes' : 'Add transaction'}
            onPress={handleSave}
            size="md"
            disabled={!canSave}
            style={styles.submitBtn}
          />
        </View>
      </View>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  screenBody: {
    flex: 1,
    position: 'relative',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 350,
    gap: Spacing.lg,
  },
  amountCard: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  scanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
    marginTop: -4,
  },
  scanBannerText: {
    flex: 1,
    color: Colors.textSecondary,
  },
  formCard: {
    gap: Spacing.lg,
  },
  field: {
    gap: 10,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  dateArrowDisabled: {
    opacity: 0.35,
  },
  dateLabel: {
    flex: 1,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  fixedBottomContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  submitBtn: {
    marginTop: 4,
  },
});
