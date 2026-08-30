import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { AppTextInput } from '@/components/ui/app-text-input';
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
import { Colors, BorderRadius, ControlHeights, Spacing, Shadows } from '@/constants/theme';

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
  const scrollRef = useRef<ScrollView>(null);

  const scrollToInputs = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 250);
  }, []);

  useEffect(() => {
    if (keyboardVisible) {
      scrollToInputs();
    }
  }, [keyboardVisible, scrollToInputs]);

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

    // Editing the amount of a transaction that already has a split doesn't
    // touch split_participants — the participants' shares would silently
    // stop adding up to the new total. Warn before proceeding rather than
    // letting the mismatch happen invisibly (same guardrail pattern as the
    // overpayment warning in split-detail.tsx).
    if (editing && existingSplitCount > 0 && numericAmount !== editing.amount) {
      Alert.alert(
        'This expense is split',
        `Changing the amount won't update the ${existingSplitCount} split share${existingSplitCount === 1 ? '' : 's'} already set for it. Adjust them from Split Details after saving if needed.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save Anyway', onPress: () => void saveTransaction() },
        ]
      );
      return;
    }

    await saveTransaction();
  };

  const saveTransaction = async () => {
    if (!accountId) return;
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
        // addTransaction() generates its own id internally and ignores
        // payload.id, so the split/recurring linkage below must use the id
        // it actually saved under — not the locally-generated txId, which
        // would otherwise point split_participants.transaction_id at a row
        // that was never inserted (and trip the foreign-key constraint).
        const created = await addTransaction(payload);
        const savedTxId = created.id;

        // If Split is configured: save split participants atomically.
        // "You" (the payer) is never inserted as a participant row — the
        // payer's own share is implicit in the transaction's own amount,
        // matching add-split.tsx's canonical creation path. Inserting a
        // row for "You" here used to leave a phantom, permanently-pending
        // "owed to yourself" entry, since insertSplitParticipantsBatch
        // always writes paidAmount:0/status:'pending' regardless of what
        // a caller passes.
        if (splitConfig && splitConfig.participants.length > 0 && type === 'expense') {
          const db = await getDb();
          await insertSplitParticipantsBatch(
            db,
            splitConfig.participants
              .filter(p => !p.isYou)
              .map(p => ({
                transactionId: savedTxId,
                name: p.name,
                shareAmount: p.share,
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
                haptics.press();
                Alert.alert('Scan Receipt', 'Choose a source to extract transaction details:', [
                  { text: 'Take Photo', onPress: () => runScan(captureAndScan) },
                  { text: 'Choose from Gallery', onPress: () => runScan(pickAndScan) },
                  { text: 'Cancel', style: 'cancel' },
                ]);
              }}
              disabled={scanning}
              style={({ pressed }) => [styles.headerScanBtn, { opacity: pressed ? 0.75 : 1 }]}
            >
              {scanning ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="scan-outline" size={16} color={Colors.primary} />
                  <AppText variant="captionStrong" color={Colors.primaryDeep}>
                    Scan
                  </AppText>
                </>
              )}
            </Pressable>
          ) : undefined
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screenBody}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            keyboardVisible && { paddingBottom: Math.max(keyboardHeight + 80, 340) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {scanned ? (
            <GlassCard padding={12} radius={BorderRadius.md} style={styles.scanBannerCard}>
              <View style={styles.scanBannerRow}>
                <View
                  style={[
                    styles.scanStatusIcon,
                    { backgroundColor: scanned.confidence >= 0.7 ? Colors.incomeSoft : Colors.primarySoft },
                  ]}
                >
                  <Ionicons
                    name={scanned.confidence >= 0.7 ? 'sparkles' : 'document-text'}
                    size={16}
                    color={scanned.confidence >= 0.7 ? Colors.income : Colors.primary}
                  />
                </View>
                <View style={styles.scanBannerTextCol}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {scanned.merchant ? scanned.merchant : 'Receipt Scanned'}
                  </AppText>
                  <AppText variant="micro" color={Colors.textMuted}>
                    {scanned.confidence >= 0.7
                      ? 'Details auto-detected from receipt'
                      : 'Partially parsed — review details below'}
                  </AppText>
                </View>
                <Pressable onPress={() => setScanned(null)} hitSlop={10} style={styles.scanBannerDismiss}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </Pressable>
              </View>
            </GlassCard>
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

          {/* Subcategories are opt-in */}
          {type !== 'transfer' && categoryId && (
            (() => {
              const categorySubcats = (state.subcategories ?? []).filter(s => s.categoryId === categoryId);
              if (categorySubcats.length === 0) return null;
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
                  </ScrollView>
                </View>
              );
            })()
          )}

          {/* Meta Action Toolbar: Date, Split, Repeat */}
          <View style={styles.metaToolbar}>
            <Pressable
              onPress={() => {
                haptics.press();
                setShowDatePicker(true);
              }}
              style={styles.metaToolbarItem}
            >
              <Ionicons name="calendar-outline" size={15} color={Colors.primary} />
              <AppText variant="micro" color={Colors.textPrimary} style={styles.metaToolbarText}>
                {isToday
                  ? 'Today'
                  : date.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
              </AppText>
              <Ionicons name="chevron-down" size={12} color={Colors.textMuted} />
            </Pressable>

            {/* Split Bill Trigger / Active Tag */}
            {!editing && type === 'expense' && (
              splitConfig ? (
                <View style={[styles.metaToolbarItem, styles.metaToolbarItemActive]}>
                  <Pressable
                    onPress={() => {
                      haptics.press();
                      setShowSplitSheet(true);
                    }}
                    style={styles.metaActivePressable}
                  >
                    <Ionicons name="people" size={15} color={Colors.primary} />
                    <AppText variant="micro" color={Colors.primaryDeep} style={styles.metaActiveText}>
                      Split ({splitConfig.participants.length} · +{formatCurrency(
                        splitConfig.participants.slice(1).reduce((s, p) => s + p.share, 0),
                        state.settings.currency ?? 'INR'
                      )})
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      haptics.press();
                      setSplitConfig(null);
                    }}
                    hitSlop={8}
                    style={styles.metaClearBtn}
                  >
                    <Ionicons name="close-circle" size={16} color={Colors.primary} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    haptics.press();
                    setShowSplitSheet(true);
                  }}
                  style={styles.metaToolbarItem}
                >
                  <Ionicons name="people-outline" size={15} color={Colors.textSecondary} />
                  <AppText variant="micro" color={Colors.textSecondary} style={styles.metaToolbarText}>
                    Split
                  </AppText>
                </Pressable>
              )
            )}

            {/* Repeat / Recurrence Trigger / Active Tag */}
            {!editing && type !== 'transfer' && (
              repeatConfig ? (
                <View style={[styles.metaToolbarItem, styles.metaToolbarItemActive]}>
                  <Pressable
                    onPress={() => {
                      haptics.press();
                      setShowRepeatSheet(true);
                    }}
                    style={styles.metaActivePressable}
                  >
                    <Ionicons name="repeat" size={15} color={Colors.primary} />
                    <AppText variant="micro" color={Colors.primaryDeep} style={styles.metaActiveText}>
                      {describeFrequency(repeatConfig as any)}
                    </AppText>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      haptics.press();
                      setRepeatConfig(null);
                    }}
                    hitSlop={8}
                    style={styles.metaClearBtn}
                  >
                    <Ionicons name="close-circle" size={16} color={Colors.primary} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    haptics.press();
                    setShowRepeatSheet(true);
                  }}
                  style={styles.metaToolbarItem}
                >
                  <Ionicons name="repeat-outline" size={15} color={Colors.textSecondary} />
                  <AppText variant="micro" color={Colors.textSecondary} style={styles.metaToolbarText}>
                    Repeat
                  </AppText>
                </Pressable>
              )
            )}

            {/* Existing split on this transaction when editing */}
            {editing && existingSplitCount > 0 && (
              <Pressable
                onPress={() => {
                  haptics.press();
                  router.push(`/split-detail?id=${editing.id}` as any);
                }}
                style={[styles.metaToolbarItem, styles.metaToolbarItemActive]}
              >
                <Ionicons name="people" size={15} color={Colors.primary} />
                <AppText variant="micro" color={Colors.primaryDeep} style={styles.metaActiveText}>
                  Split Details ({existingSplitCount} people)
                </AppText>
                <Ionicons name="chevron-forward" size={12} color={Colors.primary} />
              </Pressable>
            )}
          </View>

          {/* Payee / Merchant & Note Details Card */}
          <GlassCard style={styles.detailsCard} padding={16} radius={BorderRadius.md}>
            <View style={styles.detailsHeader}>
              <View style={styles.detailsHeaderLeft}>
                <Ionicons name="receipt-outline" size={15} color={Colors.primary} />
                <AppText variant="label" color={Colors.textSecondary}>
                  {type === 'transfer' ? 'TRANSFER MEMO' : 'PAYEE & NOTE'}
                </AppText>
              </View>
              {((payee.trim() && type !== 'transfer') || note.trim()) ? (
                <Pressable
                  onPress={() => {
                    haptics.selection();
                    setPayee('');
                    setNote('');
                  }}
                  hitSlop={8}
                >
                  <AppText variant="micro" color={Colors.textMuted}>
                    Clear all
                  </AppText>
                </Pressable>
              ) : null}
            </View>

            {type !== 'transfer' && (
              <View style={styles.field}>
                <AppText variant="micro" color={Colors.textMuted} style={styles.fieldLabel}>
                  Payee / Merchant
                </AppText>
                <AppTextInput
                  value={payee}
                  onChangeText={setPayee}
                  placeholder="e.g. Starbucks, Amazon, Grocery store"
                  placeholderTextColor={Colors.textMuted}
                  leftIcon="storefront-outline"
                  rightIcon={payee.trim() ? 'close-circle' : undefined}
                  onPressRightIcon={() => setPayee('')}
                  onFocus={scrollToInputs}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
              </View>
            )}

            <View style={styles.field}>
              <AppText variant="micro" color={Colors.textMuted} style={styles.fieldLabel}>
                {type === 'transfer' ? 'Memo / Reason' : 'Note / Description'}
              </AppText>
              <AppTextInput
                value={note}
                onChangeText={setNote}
                placeholder={type === 'transfer' ? 'e.g. Monthly rent, savings' : 'Add note, tags, invoice #...'}
                placeholderTextColor={Colors.textMuted}
                leftIcon={type === 'transfer' ? 'swap-horizontal-outline' : 'document-text-outline'}
                rightIcon={note.trim() ? 'close-circle' : undefined}
                onPressRightIcon={() => setNote('')}
                onFocus={scrollToInputs}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>
          </GlassCard>
        </ScrollView>

        {!keyboardVisible && (
          <View style={styles.fixedBottomContainer}>
            <Numpad value={amount} onChangeValue={setAmount} />
            <AppButton
              title={editing ? 'Save changes' : 'Add transaction'}
              size="lg"
              onPress={handleSave}
              disabled={!canSave}
              style={styles.submitBtn}
            />
          </View>
        )}
      </KeyboardAvoidingView>

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
        onApply={res => setSplitConfig(res)}
      />

      <RepeatSheet
        visible={showRepeatSheet}
        onClose={() => setShowRepeatSheet(false)}
        amount={numericAmount}
        currency={state.settings.currency ?? 'INR'}
        date={date}
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
    paddingHorizontal: 20,
    paddingTop: Spacing.md,
    paddingBottom: 310,
    gap: Spacing.md,
  },
  scanBannerCard: {
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  scanBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanStatusIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBannerTextCol: {
    flex: 1,
    gap: 2,
  },
  scanBannerDismiss: {
    padding: 4,
  },
  headerScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.28)',
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
  metaToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  metaToolbarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: ControlHeights.sm,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  metaToolbarItemActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
  metaToolbarText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
  metaActivePressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaActiveText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  metaClearBtn: {
    marginLeft: 4,
    padding: 2,
  },
  detailsCard: {
    gap: Spacing.md,
    marginTop: 4,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  field: {
    gap: Spacing.sm,
  },
  fieldLabel: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    color: Colors.textSecondary,
    marginLeft: 2,
    marginBottom: 2,
  },
  fixedBottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
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
