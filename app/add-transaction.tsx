import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { DatePickerModal } from '@/components/finance/date-picker-modal';
import { ScanReceiptButton } from '@/components/finance/scan-receipt-button';
import { useFinance } from '@/context/finance-context';
import { getDb } from '@/db/client';
import { getTransactionById } from '@/db/transactions';
import { Transaction, TransactionType } from '@/types/finance';
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

  // Transactions no longer live in FinanceContext's state (that was the
  // point of the migration — the ledger is queried, not held in memory), so
  // the transaction being edited is fetched here rather than found in an
  // array. Since the form's useState initializers can no longer read it
  // synchronously, they start at their "new transaction" defaults and an
  // effect below fills them in once the fetch resolves — a brief flash on
  // opening an edit rather than the instant fill the old synchronous lookup
  // gave. A form-component split that gates rendering until the fetch
  // resolves would remove that flash entirely; left as a follow-up rather
  // than done here.
  const [editing, setEditing] = useState<Transaction | undefined>(undefined);

  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    (async () => {
      const db = await getDb();
      const tx = await getTransactionById(db, params.id!);
      if (!cancelled && tx) setEditing(tx);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const [type, setType] = useState<TransactionType>(
    params.type === 'transfer' || params.type === 'income' ? (params.type as TransactionType) : 'expense'
  );
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<string | undefined>(state.accounts[0]?.id);
  const [toAccountId, setToAccountId] = useState<string | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>(undefined);
  const [note, setNote] = useState('');
  const [payee, setPayee] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setType(editing.type);
    setAmount(String(editing.amount));
    setAccountId(editing.accountId);
    setToAccountId(editing.toAccountId);
    setCategoryId(editing.categoryId);
    setSubcategoryId(editing.subcategoryId);
    setNote(editing.note ?? '');
    setPayee(editing.payee ?? '');
    setDate(new Date(editing.date));
  }, [editing]);

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

      // Auto-fill payee from merchant name if detected
      if (receipt.merchant) setPayee(receipt.merchant);

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
      subcategoryId: type !== 'transfer' ? subcategoryId : undefined,
      payee: type !== 'transfer' && payee.trim() ? payee.trim() : undefined,
      date: date.toISOString(),
      note: note.trim() || undefined,
    };

    if (editing) void updateTransaction({ ...editing, ...payload });
    else void addTransaction(payload);
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
          void deleteTransaction(editing.id);
          haptics.warning();
          router.back();
        },
      },
    ]);
  };

  const isToday = new Date().toDateString() === date.toDateString();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (payee.trim() || note.trim()) {
      setShowDetails(true);
    }
  }, [payee, note]);

  return (
    <GradientScreen edges={['top']} contours="top">
      <ModalHeader
        title={editing ? 'Edit transaction' : 'New transaction'}
        onClose={() => router.back()}
        onDelete={editing ? handleDelete : undefined}
        rightAction={
          !editing && isScanSupported() ? (
            <Pressable
              onPress={() => {
                Alert.alert('Scan Receipt', 'Choose a source', [
                  { text: 'Take Photo', onPress: () => runScan(captureAndScan) },
                  { text: 'Choose from Gallery', onPress: () => runScan(pickAndScan) },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
              style={({ pressed }) => [styles.headerScanBtn, { opacity: pressed ? 0.75 : 1 }]}
            >
              <Ionicons name="camera-outline" size={17} color={Colors.primaryDeep} />
              <AppText variant="caption" color={Colors.primaryDeep} style={{ fontWeight: '700' }}>
                Scan
              </AppText>
            </Pressable>
          ) : undefined
        }
      />

      <View style={styles.screenBody}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {scanned ? (
            <View style={styles.scanBanner}>
              <Ionicons
                name={scanned.confidence >= 0.7 ? 'checkmark-circle' : 'alert-circle'}
                size={16}
                color={scanned.confidence >= 0.7 ? Colors.income : Colors.expense}
              />
              <AppText variant="micro" style={styles.scanBannerText} numberOfLines={1}>
                {scanned.confidence >= 0.7
                  ? `Scanned${scanned.merchant ? `: ${scanned.merchant}` : ''}`
                  : 'Partially scanned — check details.'}
              </AppText>
              <Pressable onPress={() => setScanned(null)} hitSlop={10}>
                <Ionicons name="close" size={14} color={Colors.textMuted} />
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

          {/* Amount Card */}
          <GlassCard strong elevated padding={10} style={styles.amountCard}>
            <AmountDisplay
              value={amount}
              currencySymbol={getCurrencySymbol(
                state.accounts.find(a => a.id === accountId)?.currency ?? state.settings.currency ?? 'INR'
              )}
              currencyCode={state.accounts.find(a => a.id === accountId)?.currency ?? state.settings.currency ?? 'INR'}
              numberFormat={state.settings.numberFormat}
              accentColor={TYPE_COLOR[type]}
            />
          </GlassCard>

          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <AppText variant="micro" color={Colors.textMuted} style={styles.sectionLabel}>
                {type === 'transfer' ? 'FROM ACCOUNT' : 'ACCOUNT'}
              </AppText>
            </View>
            <AccountPicker
              accounts={state.accounts}
              selectedId={accountId}
              onSelect={a => setAccountId(a.id)}
            />
          </View>

          {type === 'transfer' && (
            <View style={styles.sectionWrap}>
              <View style={styles.sectionHeader}>
                <AppText variant="micro" color={Colors.textMuted} style={styles.sectionLabel}>
                  TO ACCOUNT
                </AppText>
              </View>
              <AccountPicker
                accounts={state.accounts}
                selectedId={toAccountId}
                onSelect={a => setToAccountId(a.id)}
                excludeId={accountId}
              />
            </View>
          )}

          {type !== 'transfer' && (
            <View style={styles.sectionWrap}>
              <View style={styles.sectionHeader}>
                <AppText variant="micro" color={Colors.textMuted} style={styles.sectionLabel}>
                  CATEGORY
                </AppText>
              </View>
              <CategoryPicker
                categories={categories}
                selectedId={categoryId}
                onSelect={c => {
                  setCategoryId(c.id);
                  setSubcategoryId(undefined);
                }}
                onManage={() =>
                  router.push(`/manage-categories?kind=${type === 'income' ? 'income' : 'expense'}`)
                }
              />
            </View>
          )}

          {type !== 'transfer' && categoryId && (
            (() => {
              const categorySubcats = (state.subcategories ?? []).filter(s => s.categoryId === categoryId);
              return (
                <View style={styles.subcatSection}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subcatScroll}>
                    {categorySubcats.map(sub => {
                      const isSelected = subcategoryId === sub.id;
                      return (
                        <Pressable
                          key={sub.id}
                          onPress={() => {
                            haptics.selection();
                            setSubcategoryId(isSelected ? undefined : sub.id);
                          }}
                          style={[
                            styles.subcatChip,
                            isSelected && { backgroundColor: Colors.primarySoft, borderColor: Colors.primary }
                          ]}
                        >
                          <Ionicons
                            name={sub.icon}
                            size={12}
                            color={isSelected ? Colors.primaryDeep : Colors.textSecondary}
                          />
                          <AppText
                            variant="micro"
                            color={isSelected ? Colors.primaryDeep : Colors.textPrimary}
                            style={{ fontWeight: isSelected ? '700' : '500' }}
                          >
                            {sub.name}
                          </AppText>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => router.push(`/manage-subcategories?categoryId=${categoryId}` as any)}
                      style={styles.subcatEmptyChip}
                    >
                      <Ionicons name="add" size={13} color={Colors.textMuted} />
                      <AppText variant="micro" color={Colors.textMuted}>
                        {categorySubcats.length === 0 ? 'Add subcategory' : 'Add'}
                      </AppText>
                    </Pressable>
                  </ScrollView>
                </View>
              );
            })()
          )}

          <View style={styles.metaRow}>
            <Pressable
              onPress={() => {
                haptics.press();
                setShowDatePicker(true);
              }}
              style={styles.metaChip}
            >
              <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
              <AppText variant="micro" color={Colors.textPrimary} style={{ fontWeight: '600' }}>
                {isToday
                  ? 'Today'
                  : date.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
              </AppText>
            </Pressable>

            <Pressable
              onPress={() => setShowDetails(prev => !prev)}
              style={[
                styles.metaChip,
                (payee.trim() || note.trim() || showDetails) && styles.metaChipActive,
              ]}
            >
              <Ionicons
                name="pricetag-outline"
                size={14}
                color={payee.trim() || note.trim() || showDetails ? Colors.primaryDeep : Colors.textSecondary}
              />
              <AppText
                variant="micro"
                color={payee.trim() || note.trim() || showDetails ? Colors.primaryDeep : Colors.textSecondary}
                numberOfLines={1}
                style={{ fontWeight: '600', maxWidth: 100 }}
              >
                {payee.trim() ? payee : note.trim() ? note : 'Note / Payee'}
              </AppText>
              <Ionicons
                name={showDetails ? 'chevron-up' : 'chevron-down'}
                size={12}
                color={Colors.textMuted}
              />
            </Pressable>

            {!editing && type === 'expense' && (
              <Pressable
                onPress={() => {
                  haptics.press();
                  router.push(
                    `/add-split?amount=${amount}&categoryId=${categoryId ?? ''}&accountId=${accountId ?? ''}&payee=${encodeURIComponent(payee)}` as any
                  );
                }}
                style={styles.metaChip}
              >
                <Ionicons name="people-outline" size={14} color={Colors.primary} />
                <AppText variant="micro" color={Colors.primaryDeep} style={{ fontWeight: '600' }}>
                  Split
                </AppText>
              </Pressable>
            )}

            {!editing && (type === 'expense' || type === 'income') && (
              <Pressable
                onPress={() => {
                  haptics.press();
                  router.push(
                    `/add-recurring?amount=${amount}&categoryId=${categoryId ?? ''}&accountId=${accountId ?? ''}&type=${type}&payee=${encodeURIComponent(payee)}` as any
                  );
                }}
                style={styles.metaChip}
              >
                <Ionicons name="repeat-outline" size={14} color={Colors.primary} />
                <AppText variant="micro" color={Colors.primaryDeep} style={{ fontWeight: '600' }}>
                  Repeat
                </AppText>
              </Pressable>
            )}
          </View>

          {showDetails && (
            <GlassCard padding={12} style={styles.detailsCard}>
              {type !== 'transfer' && (
                <View style={styles.inlineField}>
                  <Ionicons name="storefront-outline" size={15} color={Colors.textSecondary} />
                  <TextInput
                    value={payee}
                    onChangeText={setPayee}
                    placeholder="Payee / Merchant (e.g. Netflix, Uber)"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.inlineInput}
                  />
                </View>
              )}
              <View style={styles.inlineField}>
                <Ionicons name="create-outline" size={15} color={Colors.textSecondary} />
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Note (optional)"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.inlineInput}
                />
              </View>
            </GlassCard>
          )}
        </ScrollView>

        <View style={styles.fixedBottomContainer}>
          <Numpad value={amount} onChangeValue={setAmount} />
          <AppButton
            title={editing ? 'Save changes' : 'Add transaction'}
            size="md"
            onPress={handleSave}
            disabled={!canSave}
            style={styles.submitBtn}
          />
        </View>
      </View>

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
  screenBody: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 310,
    gap: 8,
  },
  headerScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
  },
  scanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
  },
  scanBannerText: {
    flex: 1,
    color: Colors.textPrimary,
  },
  amountCard: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.lg,
    backgroundColor: '#FFFFFF',
  },
  sectionWrap: {
    gap: 3,
  },
  sectionHeader: {
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
    fontSize: 10,
  },
  subcatSection: {
    marginTop: -2,
  },
  subcatScroll: {
    gap: 6,
    paddingVertical: 1,
  },
  subcatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  subcatEmptyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
    borderWidth: 1,
    borderColor: Colors.divider,
    borderStyle: 'dashed',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 2,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  metaChipActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  detailsCard: {
    gap: 8,
    marginTop: 2,
  },
  inlineField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
  },
  inlineInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
    padding: 0,
  },
  fixedBottomContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 18,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  submitBtn: {
    marginTop: 2,
  },
});
