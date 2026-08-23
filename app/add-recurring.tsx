import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Switch, Alert } from 'react-native';
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
import {
  RecurringRule,
  RecurringFrequency,
  IntervalUnit,
  TransactionType,
} from '@/types/finance';
import { getCurrencySymbol, formatCurrency } from '@/utils/currency';
import { haptics } from '@/utils/haptics';
import { generateId } from '@/utils/id';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { bumpDataVersion } from '@/db/version';
import {
  insertRecurringRule,
  updateRecurringRule,
  deleteRecurringRule,
  getRecurringRule,
} from '@/db/recurring';
import { computeNextDue, generateOccurrences, describeFrequency } from '@/utils/recurring-engine';

const FREQUENCY_OPTIONS: { key: RecurringFrequency; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'monthly', label: 'Monthly', icon: 'calendar-number-outline' },
  { key: 'weekly',  label: 'Weekly',  icon: 'calendar-outline' },
  { key: 'daily',   label: 'Daily',   icon: 'today-outline' },
  { key: 'yearly',  label: 'Yearly',  icon: 'calendar-clear-outline' },
  { key: 'custom',  label: 'Custom',  icon: 'options-outline' },
];

const DAYS_OF_WEEK = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

export default function AddRecurringScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    amount?: string;
    type?: string;
    accountId?: string;
    categoryId?: string;
    subcategoryId?: string;
    payee?: string;
    note?: string;
  }>();
  const { state } = useFinance();

  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null);

  const [type, setType] = useState<Exclude<TransactionType, 'transfer'>>(
    params.type === 'income' ? 'income' : 'expense'
  );
  const [amount, setAmount] = useState(params.amount ?? '');
  const [accountId, setAccountId] = useState<string | undefined>(
    params.accountId ?? state.accounts[0]?.id
  );
  const [categoryId, setCategoryId] = useState<string | undefined>(params.categoryId);
  const [subcategoryId, setSubcategoryId] = useState<string | undefined>(params.subcategoryId);
  const [payee, setPayee] = useState(params.payee ?? '');
  const [note, setNote] = useState(params.note ?? '');

  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [dayOfWeek, setDayOfWeek] = useState<number>(new Date().getDay());
  const [dayOfMonth, setDayOfMonth] = useState<number>(new Date().getDate());
  const [intervalValue, setIntervalValue] = useState<number>(1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('month');

  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [hasEndDate, setHasEndDate] = useState(false);

  const [autoCreate, setAutoCreate] = useState(true);
  const [reminderDays, setReminderDays] = useState<number>(1);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end'>('start');

  // Load existing rule if editing
  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    (async () => {
      const db = await getDb();
      const rule = await getRecurringRule(db, params.id!);
      if (!cancelled && rule) {
        setEditingRule(rule);
        setType(rule.type);
        setAmount(String(rule.amount));
        setAccountId(rule.accountId);
        setCategoryId(rule.categoryId);
        setSubcategoryId(rule.subcategoryId);
        setPayee(rule.payee ?? '');
        setNote(rule.note ?? '');
        setFrequency(rule.frequency);
        if (rule.dayOfWeek != null) setDayOfWeek(rule.dayOfWeek);
        if (rule.dayOfMonth != null) setDayOfMonth(rule.dayOfMonth);
        if (rule.intervalValue != null) setIntervalValue(rule.intervalValue);
        if (rule.intervalUnit != null) setIntervalUnit(rule.intervalUnit);
        setStartDate(new Date(rule.startDate));
        if (rule.endDate) {
          setEndDate(new Date(rule.endDate));
          setHasEndDate(true);
        }
        setAutoCreate(rule.autoCreate);
        setReminderDays(rule.reminderDays);
      }
    })();
    return () => { cancelled = true; };
  }, [params.id]);

  const categories = useMemo(
    () => state.categories.filter(c => c.kind === type),
    [state.categories, type]
  );

  const numericAmount = parseFloat(amount || '0');
  const canSave = numericAmount > 0 && !!accountId;

  // Build temporary rule object to compute next occurrences preview
  const previewRule = useMemo<RecurringRule>(() => {
    const startIso = startDate.toISOString().slice(0, 10);
    return {
      id: 'preview',
      type,
      amount: numericAmount,
      accountId: accountId ?? '',
      categoryId,
      subcategoryId,
      payee,
      note,
      frequency,
      intervalUnit,
      intervalValue,
      dayOfWeek,
      dayOfMonth,
      startDate: startIso,
      endDate: hasEndDate && endDate ? endDate.toISOString().slice(0, 10) : undefined,
      nextDue: startIso,
      autoCreate,
      reminderDays,
      active: true,
      createdAt: new Date().toISOString(),
    };
  }, [type, numericAmount, accountId, categoryId, subcategoryId, payee, note, frequency, intervalUnit, intervalValue, dayOfWeek, dayOfMonth, startDate, hasEndDate, endDate, autoCreate, reminderDays]);

  const upcomingOccurrences = useMemo(() => {
    try {
      const from = new Date(startDate);
      const to = new Date(startDate);
      to.setMonth(to.getMonth() + 4);
      return generateOccurrences(previewRule, from, to, 3);
    } catch {
      return [];
    }
  }, [previewRule, startDate]);

  const handleSave = async () => {
    if (!canSave || !accountId) return;

    const startIso = startDate.toISOString().slice(0, 10);
    const firstDue = computeNextDue(previewRule, new Date(startDate.getTime() - 1));
    const nextDueIso = firstDue.toISOString().slice(0, 10);

    const payload: RecurringRule = {
      id: editingRule ? editingRule.id : generateId(),
      type,
      amount: numericAmount,
      accountId,
      categoryId,
      subcategoryId,
      payee: payee.trim() || undefined,
      note: note.trim() || undefined,
      frequency,
      intervalUnit: frequency === 'custom' ? intervalUnit : undefined,
      intervalValue: frequency === 'custom' ? intervalValue : undefined,
      dayOfWeek: frequency === 'weekly' ? dayOfWeek : undefined,
      dayOfMonth: frequency === 'monthly' ? dayOfMonth : undefined,
      startDate: startIso,
      endDate: hasEndDate && endDate ? endDate.toISOString().slice(0, 10) : undefined,
      nextDue: editingRule ? editingRule.nextDue : nextDueIso,
      autoCreate,
      reminderDays,
      active: editingRule ? editingRule.active : true,
      createdAt: editingRule ? editingRule.createdAt : new Date().toISOString(),
    };

    try {
      const db = await getDb();
      if (editingRule) {
        await updateRecurringRule(db, payload);
      } else {
        await insertRecurringRule(db, payload);
      }
      bumpDataVersion();
      haptics.success();
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Failed to save recurring rule.');
    }
  };

  const handleDelete = () => {
    if (!editingRule) return;
    Alert.alert(
      'Delete recurring rule',
      'Past transactions created by this rule will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = await getDb();
              await deleteRecurringRule(db, editingRule.id);
              bumpDataVersion();
              haptics.success();
              router.back();
            } catch {
              Alert.alert('Error', 'Failed to delete rule.');
            }
          },
        },
      ]
    );
  };

  const currencySymbol = getCurrencySymbol(state.settings.currency ?? 'INR');

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader
        title={editingRule ? 'Edit Recurring Rule' : 'New Recurring Rule'}
        onClose={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Type selector */}
        <View style={styles.switchWrap}>
          <SegmentedControl<Exclude<TransactionType, 'transfer'>>
            options={[
              { key: 'expense', label: 'Expense' },
              { key: 'income', label: 'Income' },
            ]}
            value={type}
            onChange={next => {
              setType(next);
              setCategoryId(undefined);
            }}
          />
        </View>

        {/* Core details card */}
        <GlassCard padding={18} style={styles.card}>
          <View style={styles.field}>
            <AppText variant="label">Amount</AppText>
            <View style={styles.amountInputRow}>
              <AppText variant="h2" color={type === 'expense' ? Colors.expense : Colors.income}>
                {currencySymbol}
              </AppText>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                style={styles.amountInput}
              />
            </View>
          </View>

          <View style={styles.field}>
            <AppText variant="label">Account</AppText>
            <AccountPicker
              accounts={state.accounts}
              selectedId={accountId}
              onSelect={a => setAccountId(a.id)}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="label">Category</AppText>
            <CategoryPicker
              categories={categories}
              selectedId={categoryId}
              onSelect={c => setCategoryId(c.id)}
              onManage={() => router.push('/manage-categories?kind=' + type as any)}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="label">Payee / Merchant (Optional)</AppText>
            <TextInput
              value={payee}
              onChangeText={setPayee}
              placeholder="e.g. Netflix, Rent, Internet"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="label">Note (Optional)</AppText>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Shared with roommates"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
          </View>
        </GlassCard>

        {/* Schedule & Recurrence Card */}
        <GlassCard padding={18} style={styles.card}>
          <AppText variant="h3">Schedule & Frequency</AppText>

          {/* Frequency selector buttons */}
          <View style={styles.frequencyRow}>
            {FREQUENCY_OPTIONS.map(opt => {
              const isSelected = frequency === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => {
                    haptics.selection();
                    setFrequency(opt.key);
                  }}
                  style={[
                    styles.freqButton,
                    isSelected && styles.freqButtonActive,
                  ]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={isSelected ? '#FFFFFF' : Colors.textSecondary}
                  />
                  <AppText
                    variant="caption"
                    color={isSelected ? '#FFFFFF' : Colors.textPrimary}
                    style={{ fontWeight: isSelected ? '700' : '500', marginTop: 2 }}
                  >
                    {opt.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {/* Weekly configuration */}
          {frequency === 'weekly' && (
            <View style={styles.field}>
              <AppText variant="label">Day of Week</AppText>
              <View style={styles.dowRow}>
                {DAYS_OF_WEEK.map(d => {
                  const isSelected = dayOfWeek === d.value;
                  return (
                    <Pressable
                      key={d.value}
                      onPress={() => {
                        haptics.selection();
                        setDayOfWeek(d.value);
                      }}
                      style={[
                        styles.dowButton,
                        isSelected && styles.dowButtonActive,
                      ]}
                    >
                      <AppText
                        variant="caption"
                        color={isSelected ? '#FFFFFF' : Colors.textPrimary}
                        style={{ fontWeight: isSelected ? '700' : '500' }}
                      >
                        {d.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Monthly configuration */}
          {frequency === 'monthly' && (
            <View style={styles.field}>
              <AppText variant="label">Day of Month</AppText>
              <View style={styles.domRow}>
                <Pressable
                  onPress={() => setDayOfMonth(Math.max(1, dayOfMonth - 1))}
                  style={styles.stepButton}
                >
                  <Ionicons name="remove" size={18} color={Colors.textPrimary} />
                </Pressable>
                <View style={styles.domValueWrap}>
                  <AppText variant="h2">
                    {dayOfMonth === -1 ? 'Last day' : `${dayOfMonth}${dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th'}`}
                  </AppText>
                  <AppText variant="caption" color={Colors.textMuted}>of every month</AppText>
                </View>
                <Pressable
                  onPress={() => setDayOfMonth(Math.min(31, dayOfMonth + 1))}
                  style={styles.stepButton}
                >
                  <Ionicons name="add" size={18} color={Colors.textPrimary} />
                </Pressable>
              </View>
            </View>
          )}

          {/* Custom interval configuration */}
          {frequency === 'custom' && (
            <View style={styles.field}>
              <AppText variant="label">Repeat Every</AppText>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput
                  value={String(intervalValue)}
                  onChangeText={v => setIntervalValue(Math.max(1, parseInt(v) || 1))}
                  keyboardType="number-pad"
                  style={[styles.input, { width: 70, textAlign: 'center' }]}
                />
                <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
                  {(['day', 'week', 'month', 'year'] as IntervalUnit[]).map(unit => {
                    const isSelected = intervalUnit === unit;
                    return (
                      <Pressable
                        key={unit}
                        onPress={() => setIntervalUnit(unit)}
                        style={[
                          styles.unitButton,
                          isSelected && styles.unitButtonActive,
                        ]}
                      >
                        <AppText
                          variant="caption"
                          color={isSelected ? '#FFFFFF' : Colors.textPrimary}
                          style={{ fontWeight: isSelected ? '700' : '400' }}
                        >
                          {unit}{intervalValue > 1 ? 's' : ''}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {/* Start Date */}
          <View style={styles.field}>
            <AppText variant="label">Starts On</AppText>
            <Pressable
              onPress={() => {
                setDatePickerTarget('start');
                setShowDatePicker(true);
              }}
              style={styles.datePickerBtn}
            >
              <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
              <AppText variant="bodyStrong">
                {startDate.toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </AppText>
            </Pressable>
          </View>

          {/* End Date toggle */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">Set End Date</AppText>
              <AppText variant="caption" color={Colors.textSecondary}>
                Automatically stops after this date
              </AppText>
            </View>
            <Switch
              value={hasEndDate}
              onValueChange={v => {
                setHasEndDate(v);
                if (v && !endDate) {
                  const d = new Date(startDate);
                  d.setFullYear(d.getFullYear() + 1);
                  setEndDate(d);
                }
              }}
              trackColor={{ false: Colors.track, true: Colors.primary }}
            />
          </View>

          {hasEndDate && endDate && (
            <Pressable
              onPress={() => {
                setDatePickerTarget('end');
                setShowDatePicker(true);
              }}
              style={styles.datePickerBtn}
            >
              <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
              <AppText variant="bodyStrong">
                {endDate.toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </AppText>
            </Pressable>
          )}
        </GlassCard>

        {/* Automation & Reminders Card */}
        <GlassCard padding={18} style={styles.card}>
          <AppText variant="h3">Automation & Alerts</AppText>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">Auto-Create Transactions</AppText>
              <AppText variant="caption" color={Colors.textSecondary}>
                {autoCreate
                  ? 'Writes the transaction silently on each due date'
                  : 'Sends a reminder notification to confirm each occurrence'}
              </AppText>
            </View>
            <Switch
              value={autoCreate}
              onValueChange={setAutoCreate}
              trackColor={{ false: Colors.track, true: Colors.primary }}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="label">Advance Reminder</AppText>
            <View style={styles.reminderRow}>
              {[
                { label: 'On day', days: 0 },
                { label: '1 day early', days: 1 },
                { label: '3 days early', days: 3 },
                { label: '1 week early', days: 7 },
              ].map(opt => {
                const isSelected = reminderDays === opt.days;
                return (
                  <Pressable
                    key={opt.days}
                    onPress={() => setReminderDays(opt.days)}
                    style={[
                      styles.reminderChip,
                      isSelected && styles.reminderChipActive,
                    ]}
                  >
                    <AppText
                      variant="caption"
                      color={isSelected ? '#FFFFFF' : Colors.textPrimary}
                      style={{ fontWeight: isSelected ? '700' : '400' }}
                    >
                      {opt.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </GlassCard>

        {/* Summary preview card */}
        <GlassCard padding={16} style={[styles.card, styles.previewCard]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="sparkles" size={18} color={Colors.primary} />
            <AppText variant="bodyStrong" color={Colors.primaryDeep}>
              {describeFrequency(previewRule)}
            </AppText>
          </View>
          <AppText variant="caption" color={Colors.textSecondary} style={{ marginTop: 4 }}>
            Next occurrences:
          </AppText>
          <View style={styles.occurrencesList}>
            {upcomingOccurrences.map((occ, idx) => (
              <View key={idx} style={styles.occurrenceItem}>
                <Ionicons name="ellipse" size={6} color={Colors.primary} />
                <AppText variant="caption" color={Colors.textPrimary}>
                  {occ.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </AppText>
                {numericAmount > 0 && (
                  <AppText variant="caption" color={Colors.textMuted}>
                    ({formatCurrency(numericAmount, state.settings.currency ?? 'INR')})
                  </AppText>
                )}
              </View>
            ))}
          </View>
        </GlassCard>

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          {editingRule && (
            <AppButton
              title="Delete Rule"
              variant="glass"
              size="md"
              onPress={handleDelete}
              style={{ flex: 1 }}
            />
          )}
          <AppButton
            title={editingRule ? 'Save Changes' : 'Create Recurring Rule'}
            size="md"
            onPress={handleSave}
            disabled={!canSave}
            style={{ flex: 2 }}
          />
        </View>
      </ScrollView>

      <DatePickerModal
        visible={showDatePicker}
        selectedDate={datePickerTarget === 'start' ? startDate : (endDate ?? new Date())}
        onSelectDate={d => {
          if (datePickerTarget === 'start') setStartDate(d);
          else setEndDate(d);
        }}
        onClose={() => setShowDatePicker(false)}
      />
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: Spacing.md,
  },
  switchWrap: {
    marginBottom: 4,
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
  frequencyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  freqButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  freqButtonActive: {
    backgroundColor: Colors.ctaBg,
    borderColor: Colors.ctaBg,
  },
  dowRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dowButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  dowButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  domRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
  },
  domValueWrap: {
    alignItems: 'center',
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.controlBg,
  },
  unitButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.controlBg,
  },
  unitButtonActive: {
    backgroundColor: Colors.primary,
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reminderRow: {
    flexDirection: 'row',
    gap: 6,
  },
  reminderChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  reminderChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  previewCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderColor: 'rgba(139, 92, 246, 0.25)',
  },
  occurrencesList: {
    gap: 6,
    marginTop: 6,
  },
  occurrenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
});
