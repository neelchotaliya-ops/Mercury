import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Alert,
  Platform,
} from 'react-native';
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
import { IconBadge } from '@/components/finance/icon-badge';
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
import { Colors, BorderRadius, Spacing, Shadows } from '@/constants/theme';
import { getDb } from '@/db/client';
import { bumpDataVersion } from '@/db/version';
import {
  insertRecurringRule,
  updateRecurringRule,
  deleteRecurringRule,
  getRecurringRule,
  listRecurringRules,
  pauseRecurringRule,
  resumeRecurringRule,
} from '@/db/recurring';
import { computeNextDue, generateOccurrences, describeFrequency } from '@/utils/recurring-engine';

const FREQUENCY_OPTIONS: { key: RecurringFrequency; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'monthly', label: 'Monthly', icon: 'calendar-number-outline' },
  { key: 'weekly',  label: 'Weekly',  icon: 'calendar-outline' },
  { key: 'yearly',  label: 'Yearly',  icon: 'calendar-clear-outline' },
  { key: 'daily',   label: 'Daily',   icon: 'today-outline' },
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
  const currency = state.settings.currency ?? 'INR';
  const currencySymbol = getCurrencySymbol(currency);

  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);

  // If params.id, params.amount, or params.payee is passed, open in form mode. Otherwise start in hub list mode.
  const [isFormOpen, setIsFormOpen] = useState(
    Boolean(params.id || params.amount || params.payee || params.categoryId)
  );

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

  const loadRules = useCallback(async () => {
    try {
      const db = await getDb();
      const loaded = await listRecurringRules(db);
      setRules(loaded);
    } catch {}
    finally {
      setLoadingRules(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Load existing rule if editing via param
  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    (async () => {
      const db = await getDb();
      const rule = await getRecurringRule(db, params.id!);
      if (!cancelled && rule) {
        populateForm(rule);
        setIsFormOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, [params.id]);

  const populateForm = (rule: RecurringRule) => {
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
    } else {
      setHasEndDate(false);
      setEndDate(null);
    }
    setAutoCreate(rule.autoCreate);
    setReminderDays(rule.reminderDays);
  };

  const resetForm = () => {
    setEditingRule(null);
    setType('expense');
    setAmount('');
    setAccountId(state.accounts[0]?.id);
    setCategoryId(undefined);
    setSubcategoryId(undefined);
    setPayee('');
    setNote('');
    setFrequency('monthly');
    setDayOfWeek(new Date().getDay());
    setDayOfMonth(new Date().getDate());
    setIntervalValue(1);
    setIntervalUnit('month');
    setStartDate(new Date());
    setHasEndDate(false);
    setEndDate(null);
    setAutoCreate(true);
    setReminderDays(1);
  };

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
      await loadRules();
      setIsFormOpen(false);
      resetForm();
    } catch (e) {
      Alert.alert('Error', 'Failed to save recurring rule.');
    }
  };

  const handleToggleActive = async (rule: RecurringRule) => {
    haptics.selection();
    try {
      const db = await getDb();
      if (rule.active) {
        await pauseRecurringRule(db, rule.id);
      } else {
        await resumeRecurringRule(db, rule.id);
      }
      bumpDataVersion();
      await loadRules();
    } catch {
      Alert.alert('Error', 'Failed to update rule status.');
    }
  };

  const handleDelete = (ruleId: string) => {
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
              await deleteRecurringRule(db, ruleId);
              bumpDataVersion();
              haptics.success();
              await loadRules();
              if (isFormOpen && editingRule?.id === ruleId) {
                setIsFormOpen(false);
                resetForm();
              }
            } catch {
              Alert.alert('Error', 'Failed to delete rule.');
            }
          },
        },
      ]
    );
  };

  // Monthly commitment calculation
  const monthlyExpenseTotal = useMemo(() => {
    return rules
      .filter(r => r.active && r.type === 'expense')
      .reduce((sum, r) => {
        if (r.frequency === 'monthly') return sum + r.amount;
        if (r.frequency === 'weekly') return sum + r.amount * 4.33;
        if (r.frequency === 'yearly') return sum + r.amount / 12;
        if (r.frequency === 'daily') return sum + r.amount * 30;
        return sum + r.amount;
      }, 0);
  }, [rules]);

  // If form is closed and we have rules or want to view hub list
  if (!isFormOpen && !params.id) {
    return (
      <GradientScreen edges={['top', 'bottom']} contours="top">
        <ModalHeader
          title="Recurring Payments"
          onClose={() => router.back()}
          rightAction={
            <Pressable
              onPress={() => {
                haptics.press();
                resetForm();
                setIsFormOpen(true);
              }}
              style={styles.addRuleBtn}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <AppText variant="captionStrong" color="#FFFFFF">
                New Rule
              </AppText>
            </Pressable>
          }
        />

        <ScrollView contentContainerStyle={styles.content}>
          {/* Monthly Commitment Hero Card */}
          <GlassCard padding={18} strong elevated style={styles.heroCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <AppText variant="caption" color={Colors.textSecondary}>Monthly Commitment</AppText>
                <AppText variant="h1" color={Colors.primaryDeep} style={{ marginTop: 2 }}>
                  {formatCurrency(monthlyExpenseTotal, currency)}
                </AppText>
                <AppText variant="caption" color={Colors.textMuted} style={{ marginTop: 2 }}>
                  ~{formatCurrency(monthlyExpenseTotal * 12, currency)} / year
                </AppText>
              </View>

              <View style={styles.activePill}>
                <Ionicons name="repeat" size={14} color={Colors.primary} />
                <AppText variant="captionStrong" color={Colors.primaryDeep} style={{ marginLeft: 4 }}>
                  {rules.filter(r => r.active).length} Active
                </AppText>
              </View>
            </View>
          </GlassCard>

          {/* Rules List */}
          {rules.length === 0 ? (
            <GlassCard padding={24} style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="repeat-outline" size={32} color={Colors.primary} />
              </View>
              <AppText variant="h3" style={{ textAlign: 'center', marginTop: 12 }}>
                No Recurring Rules Yet
              </AppText>
              <AppText variant="caption" color={Colors.textSecondary} style={{ textAlign: 'center', marginTop: 4 }}>
                Track subscriptions, rent, utility bills, and salary with automatic logging.
              </AppText>
              <AppButton
                title="+ Add First Recurring Rule"
                size="md"
                onPress={() => {
                  haptics.press();
                  resetForm();
                  setIsFormOpen(true);
                }}
                style={{ marginTop: 16 }}
              />
            </GlassCard>
          ) : (
            <View style={styles.rulesContainer}>
              <AppText variant="label" style={styles.rulesTitle}>All Recurring Rules</AppText>
              {rules.map(rule => {
                const category = state.categories.find(c => c.id === rule.categoryId);
                const account = state.accounts.find(a => a.id === rule.accountId);
                const freqText = describeFrequency(rule);

                return (
                  <GlassCard key={rule.id} padding={14} style={[styles.ruleCard, !rule.active && styles.ruleCardInactive]}>
                    <Pressable
                      onPress={() => {
                        haptics.press();
                        populateForm(rule);
                        setIsFormOpen(true);
                      }}
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                    >
                      <IconBadge
                        icon={category?.icon ?? (rule.type === 'income' ? 'cash-outline' : 'repeat-outline')}
                        color={category?.color ?? Colors.primary}
                        size={38}
                      />
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="bodyStrong" numberOfLines={1}>
                          {rule.payee || rule.note || 'Recurring Rule'}
                        </AppText>
                        <AppText variant="caption" color={Colors.textSecondary}>
                          {freqText} · {account?.name ?? 'Account'}
                        </AppText>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <View style={[styles.dueBadge, rule.active ? styles.dueBadgeActive : styles.dueBadgePaused]}>
                            <AppText variant="micro" color={rule.active ? Colors.primaryDeep : Colors.textMuted} style={{ fontWeight: '600' }}>
                              {rule.active ? `Next: ${new Date(rule.nextDue).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Paused'}
                            </AppText>
                          </View>
                          {rule.autoCreate && rule.active && (
                            <View style={styles.autoPill}>
                              <Ionicons name="flash" size={10} color={Colors.income} />
                              <AppText variant="micro" color={Colors.income} style={{ fontWeight: '600' }}>
                                Auto-logs
                              </AppText>
                            </View>
                          )}
                        </View>
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <AppText variant="bodyStrong" color={rule.type === 'income' ? Colors.income : Colors.textPrimary}>
                          {rule.type === 'income' ? '+' : '−'}{formatCurrency(rule.amount, currency)}
                        </AppText>
                        <Switch
                          value={rule.active}
                          onValueChange={() => handleToggleActive(rule)}
                          trackColor={{ false: 'rgba(25, 21, 39, 0.12)', true: Colors.primary }}
                          thumbColor="#FFFFFF"
                          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                        />
                      </View>
                    </Pressable>
                  </GlassCard>
                );
              })}
            </View>
          )}
        </ScrollView>
      </GradientScreen>
    );
  }

  // Otherwise, render Add / Edit Form
  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader
        title={editingRule ? 'Edit Recurring Rule' : 'New Recurring Rule'}
        onClose={() => {
          setIsFormOpen(false);
          resetForm();
          if (params.id) router.back();
        }}
        onDelete={editingRule ? () => handleDelete(editingRule.id) : undefined}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
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
              onManage={() => router.push(('/manage-categories?kind=' + type) as any)}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="label">Payee / Subscription Name</AppText>
            <TextInput
              value={payee}
              onChangeText={setPayee}
              placeholder="e.g. Netflix, Rent, Gym, Salary"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="label">Note (Optional)</AppText>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Shared with family"
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
                  onPress={() => {
                    haptics.selection();
                    setDayOfMonth(Math.max(1, dayOfMonth - 1));
                  }}
                  style={styles.stepButton}
                >
                  <Ionicons name="remove" size={18} color={Colors.textPrimary} />
                </Pressable>
                <View style={styles.domValueWrap}>
                  <AppText variant="h2" color={Colors.primaryDeep}>
                    {dayOfMonth === -1 ? 'Last day' : `${dayOfMonth}${dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th'}`}
                  </AppText>
                  <AppText variant="micro" color={Colors.textMuted}>of every month</AppText>
                </View>
                <Pressable
                  onPress={() => {
                    haptics.selection();
                    setDayOfMonth(Math.min(31, dayOfMonth + 1));
                  }}
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
                        onPress={() => {
                          haptics.selection();
                          setIntervalUnit(unit);
                        }}
                        style={[
                          styles.unitButton,
                          isSelected && styles.unitButtonActive,
                        ]}
                      >
                        <AppText
                          variant="caption"
                          color={isSelected ? '#FFFFFF' : Colors.textPrimary}
                          style={{ fontWeight: isSelected ? '700' : '500' }}
                        >
                          {unit}s
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
            <AppText variant="label">Start Date</AppText>
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
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">Has End Date</AppText>
              <AppText variant="caption" color={Colors.textSecondary}>
                Automatically stop recurrence on a specific date
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
              trackColor={{ false: 'rgba(25, 21, 39, 0.12)', true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {hasEndDate && endDate && (
            <View style={styles.field}>
              <AppText variant="label">End Date</AppText>
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
            </View>
          )}
        </GlassCard>

        {/* Automation & Reminders Card */}
        <GlassCard padding={18} style={styles.card}>
          <AppText variant="h3">Automation & Reminders</AppText>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">Auto-Create Transactions</AppText>
              <AppText variant="caption" color={Colors.textSecondary}>
                Automatically write the transaction on the due date
              </AppText>
            </View>
            <Switch
              value={autoCreate}
              onValueChange={setAutoCreate}
              trackColor={{ false: 'rgba(25, 21, 39, 0.12)', true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {!autoCreate && (
            <View style={styles.field}>
              <AppText variant="label">Remind Before Due Date</AppText>
              <View style={styles.reminderRow}>
                {[0, 1, 2, 3, 7].map(days => {
                  const isSelected = reminderDays === days;
                  return (
                    <Pressable
                      key={days}
                      onPress={() => setReminderDays(days)}
                      style={[
                        styles.reminderChip,
                        isSelected && styles.reminderChipActive,
                      ]}
                    >
                      <AppText
                        variant="caption"
                        color={isSelected ? '#FFFFFF' : Colors.textPrimary}
                        style={{ fontWeight: isSelected ? '700' : '500' }}
                      >
                        {days === 0 ? 'Same day' : `${days}d before`}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </GlassCard>

        {/* Next occurrences preview card */}
        {numericAmount > 0 && upcomingOccurrences.length > 0 && (
          <GlassCard padding={18} style={styles.card}>
            <AppText variant="h3">Upcoming Schedule</AppText>
            <View style={styles.occurrencesList}>
              {upcomingOccurrences.map((occDate, idx) => (
                <View key={idx} style={styles.occurrenceItem}>
                  <View style={styles.occurrenceDot} />
                  <AppText variant="bodyStrong" style={{ flex: 1, marginLeft: 10 }}>
                    {occDate.toLocaleDateString(undefined, {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </AppText>
                  <AppText variant="bodyStrong" color={type === 'expense' ? Colors.expense : Colors.income}>
                    {type === 'income' ? '+' : '−'}{formatCurrency(numericAmount, currency)}
                  </AppText>
                </View>
              ))}
            </View>
          </GlassCard>
        )}

        <AppButton
          title={editingRule ? 'Save Changes' : 'Create Recurring Rule'}
          size="md"
          onPress={handleSave}
          disabled={!canSave}
          style={{ marginTop: 4, marginBottom: 20 }}
        />
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
    paddingBottom: 80,
    gap: Spacing.md,
  },
  addRuleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primary,
  },
  heroCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
    borderColor: 'rgba(139, 92, 246, 0.25)',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rulesContainer: {
    gap: 8,
  },
  rulesTitle: {
    fontSize: 12,
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  ruleCard: {
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  ruleCardInactive: {
    opacity: 0.6,
  },
  dueBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
  },
  dueBadgeActive: {
    backgroundColor: Colors.primarySoft,
  },
  dueBadgePaused: {
    backgroundColor: 'rgba(25, 21, 39, 0.06)',
  },
  autoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.incomeSoft,
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
    gap: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: Colors.divider,
    paddingBottom: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontFamily: 'Manrope_700Bold',
    color: Colors.textPrimary,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    fontSize: 15,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
  },
  frequencyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  freqButton: {
    flex: 1,
    minWidth: '28%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  freqButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
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
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.controlBg,
  },
  dowButtonActive: {
    backgroundColor: Colors.primary,
  },
  domRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
    borderRadius: BorderRadius.lg,
  },
  domValueWrap: {
    alignItems: 'center',
  },
  stepButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.surfaceOpaque,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.soft,
  },
  unitButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.controlBg,
  },
  unitButtonActive: {
    backgroundColor: Colors.primary,
  },
  switchRow: {
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
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.controlBg,
  },
  reminderChipActive: {
    backgroundColor: Colors.primary,
  },
  occurrencesList: {
    gap: 10,
  },
  occurrenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  occurrenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
});
