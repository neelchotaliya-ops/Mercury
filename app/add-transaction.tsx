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
import { SplitSheet, SplitSheetResult } from '@/components/finance/split-sheet';
import { RepeatSheet, RepeatSheetConfig } from '@/components/finance/repeat-sheet';
import { useKeyboardBottomInset } from '@/hooks/use-keyboard-bottom-inset';
import { useFinance } from '@/context/finance-context';
import { getDb } from '@/db/client';
import { getTransactionById } from '@/db/transactions';
import { insertSplitParticipantsBatch, listSplitParticipants } from '@/db/splits';
import { insertRecurringRule } from '@/db/recurring';
import { computeNextDue, formatDateIso, describeFrequency } from '@/utils/recurring-engine';
import { Transaction, TransactionType } from '@/types/finance';
import { getCurrencySymbol, formatCurrency } from '@/utils/currency';
import { generateId } from '@/utils/id';
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
import { Colors, BorderRadius, Spacing, Shadows } from '@/constants/theme';

const TYPE_COLOR: Record<TransactionType, string> = {
  expense: Colors.expense,
  income: Colors.income,
  transfer: Colors.primary,
};

export default function AddTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; fromScan?: string; imageUri?: string }>();
  const { state, addTransaction, updateTransaction, deleteTransaction } = useFinance();

  const [editing, setEditing] = useState<Transaction | undefined>(undefined);

  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    (async () => {
      try {
        const db = await getDb();
        const tx = await getTransactionById(db, params.id!);
        if (!cancelled && tx) {
          setEditing(tx);
          const participants = await listSplitParticipants(db, tx.id);
          setExistingSplitCount(participants.length);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState<string | undefined>(state.accounts[0]?.id);
  const [toAccountId, setToAccountId] = useState<string | undefined>(state.accounts[1]?.id);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>(undefined);
  const [note, setNote] = useState('');
  const [payee, setPayee] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [splitConfig, setSplitConfig] = useState<SplitSheetResult | null>(null);
  const [repeatConfig, setRepeatConfig] = useState<RepeatSheetConfig | null>(null);
  const [showSplitSheet, setShowSplitSheet] = useState(false);
  const [showRepeatSheet, setShowRepeatSheet] = useState(false);
  const [existingSplitCount, setExistingSplitCount] = useState<number>(0);
  const { keyboardVisible, keyboardHeight } = useKeyboardBottomInset();

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

  // Handle scanned receipt auto-fill
  const [scanned, setScanned] = useState<{ merchant?: string; confidence: number } | null>(null);
  const [scanning, setScanning] = useState(false);

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

      if (receipt.merchant) setPayee(receipt.merchant);

      setCategoryId(guessCategory(receipt, state.categories, kind)?.id);
      setAccountId(guessAccount(receipt, state.accounts)?.id ?? state.accounts[0]?.id);

      setScanned({ merchant: receipt.merchant, confidence: receipt.confidence });
      haptics.success();
    },
    [state.categories, state.accounts]
  );

  const runScan = async (pickerFn: () => Promise<ScanResult | null>) => {
    try {
      setScanning(true);
      const res = await pickerFn();
      if (res) applyScanResult(res);
    } catch (err: any) {
      Alert.alert('Scan failed', describeScanFailure(err));
    } finally {
      setScanning(false);
    }
  };

  const categories = state.categories.filter(c => c.kind === (type === 'income' ? 'income' : 'expense'));

  // Default category on switch
  useEffect(() => {
    if (type === 'transfer') {
      setCategoryId(undefined);
      setSubcategoryId(undefined);
    } else if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [type, categories, categoryId]);

  const numericAmount = parseFloat(amount || '0');
  const canSave =
    numericAmount > 0 &&
    !!accountId &&
    (type !== 'transfer' ? !!categoryId : !!toAccountId && toAccountId !== accountId);

  const handleSave = async () => {
    if (!canSave || !accountId) return;
    const txId = editing?.id ?? generateId();
    const payload: Omit<Transaction, 'createdAt'> = {
      id: txId,
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

    try {
      if (editing) {
        await updateTransaction({ ...editing, ...payload });
      } else {
        await addTransaction(payload);

        // If Split is configured: save split participants atomically
        if (splitConfig && splitConfig.participants.length > 0 && type === 'expense') {
          const db = await getDb();
          await insertSplitParticipantsBatch(
            db,
            splitConfig.participants.map(p => ({
              id: generateId(),
              transactionId: txId,
              name: p.name,
              shareAmount: p.share,
              paidAmount: p.isYou ? p.share : 0,
              status: p.isYou ? 'paid' : 'pending',
              note: note.trim() || (payee ? `Split: ${payee}` : undefined),
            }))
          );
        }

        // If Recurring is configured: save recurring rule
        if (repeatConfig && type !== 'transfer') {
          const db = await getDb();
          const nextDue = computeNextDue(
            {
              frequency: repeatConfig.frequency,
              intervalUnit: repeatConfig.intervalUnit,
              intervalValue: repeatConfig.intervalValue,
              dayOfWeek: repeatConfig.dayOfWeek,
              dayOfMonth: repeatConfig.dayOfMonth,
            } as any,
            date
          );

          await insertRecurringRule(db, {
            id: generateId(),
            type,
            amount: numericAmount,
            accountId,
            categoryId,
            subcategoryId,
            payee: payee.trim() || undefined,
            note: note.trim() || undefined,
            frequency: repeatConfig.frequency,
            intervalUnit: repeatConfig.intervalUnit,
            intervalValue: repeatConfig.intervalValue,
            dayOfWeek: repeatConfig.dayOfWeek,
            dayOfMonth: repeatConfig.dayOfMonth,
            startDate: date.toISOString().slice(0, 10),
            nextDue: formatDateIso(nextDue),
            autoCreate: repeatConfig.autoCreate,
            reminderDays: repeatConfig.reminderDays,
            active: true,
            createdAt: new Date().toISOString(),
          });
        }
      }

      haptics.success();
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save transaction.');
    }
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
              <AppText variant="captionStrong" color={Colors.primaryDeep}>
                Scan
              </AppText>
            </Pressable>
          ) : undefined
        }
      />

      <View style={styles.screenBody}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            keyboardVisible && { paddingBottom: keyboardHeight + 80 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={true}
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

            {/* Existing split on this transaction when editing */}
            {editing && existingSplitCount > 0 && (
              <Pressable
                onPress={() => {
                  haptics.press();
                  router.push(`/split-detail?id=${editing.id}` as any);
                }}
                style={[styles.metaChip, styles.metaChipActive]}
              >
                <Ionicons name="people" size={14} color={Colors.primary} />
                <AppText variant="micro" color={Colors.primaryDeep} style={{ fontWeight: '700' }}>
                  Split Details ({existingSplitCount} people)
                </AppText>
                <Ionicons name="chevron-forward" size={12} color={Colors.primary} />
              </Pressable>
            )}

            {/* Split Bill chip / active status */}
            {!editing && type === 'expense' && (
              splitConfig ? (
                <View style={[styles.metaChip, styles.metaChipActive, { paddingRight: 6 }]}>
                  <Pressable
                    onPress={() => {
                      haptics.press();
                      setShowSplitSheet(true);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                  >
                    <Ionicons name="people" size={14} color={Colors.primary} />
                    <AppText variant="micro" color={Colors.primaryDeep} style={{ fontWeight: '700' }}>
                      Split ({splitConfig.participants.length} people · +{formatCurrency(
                        splitConfig.participants.slice(1).reduce((s, p) => s + p.share, 0),
                        state.settings.currency ?? 'INR'
                      )} owed)
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      haptics.press();
                      setSplitConfig(null);
                    }}
                    hitSlop={8}
                    style={{ marginLeft: 4, padding: 2 }}
                  >
                    <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    haptics.press();
                    setShowSplitSheet(true);
                  }}
                  style={styles.metaChip}
                >
                  <Ionicons name="people-outline" size={14} color={Colors.primary} />
                  <AppText variant="micro" color={Colors.primaryDeep} style={{ fontWeight: '600' }}>
                    Split
                  </AppText>
                </Pressable>
              )
            )}

            {/* Repeat / Recurrence chip / active status */}
            {!editing && type !== 'transfer' && (
              repeatConfig ? (
                <View style={[styles.metaChip, styles.metaChipActive, { paddingRight: 6 }]}>
                  <Pressable
                    onPress={() => {
                      haptics.press();
                      setShowRepeatSheet(true);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                  >
                    <Ionicons name="repeat" size={14} color={Colors.primary} />
                    <AppText variant="micro" color={Colors.primaryDeep} style={{ fontWeight: '700' }}>
                      {describeFrequency(repeatConfig as any)}
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      haptics.press();
                      setRepeatConfig(null);
                    }}
                    hitSlop={8}
                    style={{ marginLeft: 4, padding: 2 }}
                  >
                    <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    haptics.press();
                    setShowRepeatSheet(true);
                  }}
                  style={styles.metaChip}
                >
                  <Ionicons name="repeat-outline" size={14} color={Colors.primary} />
                  <AppText variant="micro" color={Colors.primaryDeep} style={{ fontWeight: '600' }}>
                    Repeat
                  </AppText>
                </Pressable>
              )
            )}
          </View>

          {showDetails && (
            <GlassCard style={styles.detailsCard} padding={12}>
              {type !== 'transfer' && (
                <View style={styles.field}>
                  <AppText variant="label">Payee / Merchant</AppText>
                  <TextInput
                    value={payee}
                    onChangeText={setPayee}
                    placeholder="e.g. Starbucks, Amazon"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.input}
                  />
                </View>
              )}

              <View style={styles.field}>
                <AppText variant="label">Note</AppText>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add a note..."
                  placeholderTextColor={Colors.textMuted}
                  style={styles.input}
                />
              </View>
            </GlassCard>
          )}
        </ScrollView>

        {!keyboardVisible && (
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
        )}
      </View>

      <DatePickerModal
        visible={showDatePicker}
        selectedDate={date}
        onSelectDate={setDate}
        onClose={() => setShowDatePicker(false)}
      />

      <SplitSheet
        visible={showSplitSheet}
        onClose={() => setShowSplitSheet(false)}
        totalAmount={numericAmount}
        currency={state.settings.currency ?? 'INR'}
        initialParticipants={splitConfig?.participants}
        initialMethod={splitConfig?.method}
        onApply={res => setSplitConfig(res)}
      />

      <RepeatSheet
        visible={showRepeatSheet}
        onClose={() => setShowRepeatSheet(false)}
        amount={numericAmount}
        currency={state.settings.currency ?? 'INR'}
        initialConfig={repeatConfig ?? undefined}
        onApply={cfg => setRepeatConfig(cfg)}
      />
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  screenBody: {
    flex: 1,
    position: 'relative',
  },
  content: {
    padding: 16,
    paddingBottom: 310,
    gap: 12,
  },
  scanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
  },
  scanBannerText: {
    flex: 1,
    color: Colors.textPrimary,
    fontFamily: 'Manrope_600SemiBold',
  },
  headerScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
  },
  amountCard: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  sectionWrap: {
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    fontFamily: 'Manrope_700Bold',
  },
  subcatSection: {
    marginTop: -4,
  },
  subcatScroll: {
    gap: 6,
    paddingHorizontal: 2,
  },
  subcatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(25, 21, 39, 0.08)',
  },
  subcatEmptyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(25, 21, 39, 0.06)',
    borderStyle: 'dashed',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(25, 21, 39, 0.08)',
  },
  metaChipActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  detailsCard: {
    gap: 10,
    marginTop: 4,
  },
  field: {
    gap: 4,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  fixedBottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 16,
    gap: 8,
    ...Shadows.lifted,
  },
  submitBtn: {
    marginTop: 2,
  },
});
