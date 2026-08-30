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
import { IconBadge } from '@/components/finance/icon-badge';
import { RecurringScheduleFields } from '@/components/finance/recurring-schedule-fields';
import { useRecurringScheduleForm } from '@/hooks/use-recurring-schedule-form';
import { useFinance } from '@/context/finance-context';
import { RecurringRule, TransactionType } from '@/types/finance';
import { getCurrencySymbol, formatCurrency } from '@/utils/currency';
import { haptics } from '@/utils/haptics';
import { generateId } from '@/utils/id';
import { Colors, BorderRadius, ControlHeights, Shadows, Spacing } from '@/constants/theme';
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

type RuleFilter = 'all' | 'active' | 'paused';

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
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>('all');

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

  const schedule = useRecurringScheduleForm();
  const { startDate } = schedule;

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
    schedule.populate(rule);
  };

  const resetForm = () => {
    setEditingRule(null);
    setType('expense');
    setAmount('');
    setAccountId(state.accounts[0]?.id);
    setCategoryId(undefined);
    setSubcategoryId(undefined);
    setPayee('');
    schedule.reset();
  };

  const categories = useMemo(
    () => state.categories.filter(c => c.kind === type),
    [state.categories, type]
  );

  const numericAmount = parseFloat(amount || '0');
  const canSave = numericAmount > 0 && !!accountId;

  // Build temporary rule object to compute next occurrences preview
  const previewRule = useMemo<RecurringRule>(() => {
    const fields = schedule.buildFields();
    return {
      id: 'preview',
      type,
      amount: numericAmount,
      accountId: accountId ?? '',
      categoryId,
      subcategoryId,
      payee,
      ...fields,
      nextDue: fields.startDate,
      active: true,
      createdAt: new Date().toISOString(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, numericAmount, accountId, categoryId, subcategoryId, payee, schedule.buildFields]);

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

    const fields = schedule.buildFields();
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
      ...fields,
      nextDue: editingRule ? editingRule.nextDue : nextDueIso,
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

  // Filtered rules for Hub view
  const filteredRules = useMemo(() => {
    if (ruleFilter === 'active') return rules.filter(r => r.active);
    if (ruleFilter === 'paused') return rules.filter(r => !r.active);
    return rules;
  }, [rules, ruleFilter]);

  const activeCount = rules.filter(r => r.active).length;

  // ---------------------------------------------------------------------------
  // HUB VIEW (List of all recurring payments)
  // ---------------------------------------------------------------------------
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
              <Ionicons name="add" size={17} color="#FFFFFF" />
              <AppText variant="captionStrong" color="#FFFFFF">
                New Rule
              </AppText>
            </Pressable>
          }
        />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Monthly Commitment Hero Card */}
          <GlassCard padding={18} strong elevated style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroLabelBadge}>
                <Ionicons name="calendar-outline" size={13} color={Colors.primary} />
                <AppText variant="micro" color={Colors.primaryDeep} style={styles.heroLabelText}>
                  MONTHLY COMMITMENT
                </AppText>
              </View>

              <View style={styles.activePill}>
                <View style={styles.activeDot} />
                <AppText variant="micro" color={Colors.primaryDeep} style={styles.activeCountText}>
                  {activeCount} Active
                </AppText>
              </View>
            </View>

            <View style={styles.heroAmountRow}>
              <AppText variant="h1" color={Colors.textPrimary} style={styles.heroAmountText}>
                {formatCurrency(monthlyExpenseTotal, currency)}
              </AppText>
            </View>

            <View style={styles.heroBottomRow}>
              <View style={styles.annualBadge}>
                <Ionicons name="trending-up-outline" size={13} color={Colors.textSecondary} />
                <AppText variant="caption" color={Colors.textSecondary}>
                  ~{formatCurrency(monthlyExpenseTotal * 12, currency)} / year projected
                </AppText>
              </View>
            </View>
          </GlassCard>

          {/* Filter Tabs */}
          {rules.length > 0 && (
            <View style={styles.filterWrap}>
              <SegmentedControl<RuleFilter>
                variant="dark"
                options={[
                  { key: 'all', label: `All (${rules.length})` },
                  { key: 'active', label: `Active (${activeCount})` },
                  { key: 'paused', label: `Paused (${rules.length - activeCount})` },
                ]}
                value={ruleFilter}
                onChange={next => {
                  setRuleFilter(next);
                }}
              />
            </View>
          )}

          {/* Rules List */}
          {rules.length === 0 ? (
            <GlassCard padding={26} style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="repeat" size={32} color={Colors.primary} />
              </View>
              <AppText variant="h3" color={Colors.textPrimary} style={{ textAlign: 'center', marginTop: 14 }}>
                No Recurring Rules Yet
              </AppText>
              <AppText
                variant="caption"
                color={Colors.textSecondary}
                style={{ textAlign: 'center', marginTop: 6, lineHeight: 18 }}
              >
                Set up automated repeats for rent, utilities, subscriptions, or salaries.
              </AppText>
              <AppButton
                title="+ Add First Recurring Rule"
                size="md"
                onPress={() => {
                  haptics.press();
                  resetForm();
                  setIsFormOpen(true);
                }}
                style={{ marginTop: 20 }}
              />
            </GlassCard>
          ) : filteredRules.length === 0 ? (
            <GlassCard padding={24} style={styles.emptyCard}>
              <Ionicons name="filter-outline" size={28} color={Colors.textMuted} />
              <AppText variant="bodyStrong" color={Colors.textSecondary} style={{ marginTop: 10 }}>
                No {ruleFilter} recurring rules
              </AppText>
            </GlassCard>
          ) : (
            <View style={styles.rulesContainer}>
              <View style={styles.rulesHeaderRow}>
                <AppText variant="micro" color={Colors.primaryDeep} style={styles.rulesHeaderLabel}>
                  {ruleFilter === 'all' ? 'ALL RECURRING PAYMENTS' : `${ruleFilter.toUpperCase()} PAYMENTS`}
                </AppText>
                <AppText variant="caption" color={Colors.textMuted}>
                  {filteredRules.length} {filteredRules.length === 1 ? 'rule' : 'rules'}
                </AppText>
              </View>

              {filteredRules.map(rule => {
                const category = state.categories.find(c => c.id === rule.categoryId);
                const account = state.accounts.find(a => a.id === rule.accountId);
                const freqText = describeFrequency(rule);

                return (
                  <GlassCard
                    key={rule.id}
                    padding={14}
                    style={[styles.ruleCard, !rule.active && styles.ruleCardInactive]}
                  >
                    <Pressable
                      onPress={() => {
                        haptics.press();
                        populateForm(rule);
                        setIsFormOpen(true);
                      }}
                      style={styles.ruleCardPressable}
                    >
                      <IconBadge
                        icon={category?.icon ?? (rule.type === 'income' ? 'cash-outline' : 'repeat-outline')}
                        color={category?.color ?? Colors.primary}
                        size={40}
                      />

                      <View style={styles.ruleDetailsCol}>
                        <AppText variant="bodyStrong" color={Colors.textPrimary} numberOfLines={1}>
                          {rule.payee || rule.note || category?.name || 'Recurring Payment'}
                        </AppText>
                        <AppText variant="caption" color={Colors.textSecondary} numberOfLines={1}>
                          {freqText} · {account?.name ?? 'Account'}
                        </AppText>

                        <View style={styles.ruleBadgesRow}>
                          <View style={[styles.dueBadge, rule.active ? styles.dueBadgeActive : styles.dueBadgePaused]}>
                            <AppText
                              variant="micro"
                              color={rule.active ? Colors.primaryDeep : Colors.textMuted}
                              style={{ fontWeight: '700', fontSize: 10.5 }}
                            >
                              {rule.active
                                ? `Next: ${new Date(rule.nextDue).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                  })}`
                                : 'Paused'}
                            </AppText>
                          </View>

                          {rule.autoCreate && rule.active && (
                            <View style={styles.autoPill}>
                              <Ionicons name="flash" size={10} color={Colors.income} />
                              <AppText variant="micro" color={Colors.income} style={{ fontWeight: '700', fontSize: 10 }}>
                                Auto-logs
                              </AppText>
                            </View>
                          )}
                        </View>
                      </View>

                      <View style={styles.ruleRightCol}>
                        <AppText
                          variant="bodyStrong"
                          color={rule.type === 'income' ? Colors.income : Colors.textPrimary}
                          style={styles.ruleAmountText}
                        >
                          {rule.type === 'income' ? '+' : '−'}
                          {formatCurrency(rule.amount, currency)}
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

  // ---------------------------------------------------------------------------
  // FORM VIEW (Create or Edit Recurring Rule)
  // ---------------------------------------------------------------------------
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
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
        showsVerticalScrollIndicator={false}
      >
        {/* Type selector */}
        <View style={styles.switchWrap}>
          <SegmentedControl<Exclude<TransactionType, 'transfer'>>
            variant="dark"
            options={[
              { key: 'expense', label: 'Expense', icon: 'arrow-down-circle' },
              { key: 'income', label: 'Income', icon: 'arrow-up-circle' },
            ]}
            value={type}
            onChange={next => {
              setType(next);
              setCategoryId(undefined);
            }}
          />
        </View>

        {/* Core details card */}
        <GlassCard padding={16} style={styles.card}>
          {/* Amount Field */}
          <View style={styles.field}>
            <AppText variant="micro" color={Colors.primaryDeep} style={styles.formSectionLabel}>
              AMOUNT
            </AppText>
            <View style={styles.amountInputRow}>
              <AppText
                variant="h2"
                color={type === 'expense' ? Colors.expense : Colors.income}
                style={styles.currencySymbolText}
              >
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

          {/* Account Field */}
          <View style={styles.field}>
            <AppText variant="micro" color={Colors.primaryDeep} style={styles.formSectionLabel}>
              ACCOUNT
            </AppText>
            <AccountPicker
              accounts={state.accounts}
              selectedId={accountId}
              onSelect={a => setAccountId(a.id)}
            />
          </View>

          {/* Category Field */}
          <View style={styles.field}>
            <AppText variant="micro" color={Colors.primaryDeep} style={styles.formSectionLabel}>
              CATEGORY
            </AppText>
            <CategoryPicker
              categories={categories}
              selectedId={categoryId}
              onSelect={c => setCategoryId(c.id)}
              onManage={() => router.push(('/manage-categories?kind=' + type) as any)}
            />
          </View>

          {/* Payee / Name Field */}
          <View style={styles.field}>
            <AppText variant="micro" color={Colors.primaryDeep} style={styles.formSectionLabel}>
              PAYEE / SUBSCRIPTION NAME
            </AppText>
            <TextInput
              value={payee}
              onChangeText={setPayee}
              placeholder="e.g. Netflix, Rent, Gym, Salary"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
          </View>
        </GlassCard>

        {/* Schedule Configuration Card */}
        <GlassCard padding={16} style={styles.card}>
          <RecurringScheduleFields form={schedule} advanced={true} />
        </GlassCard>

        {/* Upcoming Occurrences Unboxed Timeline */}
        {numericAmount > 0 && upcomingOccurrences.length > 0 && (
          <View style={styles.timelineSection}>
            <View style={styles.timelineHeaderRow}>
              <AppText variant="micro" color={Colors.primaryDeep} style={styles.formSectionLabel}>
                UPCOMING TIMELINE
              </AppText>
            </View>

            <View style={styles.timelineList}>
              {upcomingOccurrences.map((occDate, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === upcomingOccurrences.length - 1;
                return (
                  <View key={idx} style={styles.timelineRow}>
                    {/* Timeline Axis (Dot + Track) */}
                    <View style={styles.timelineAxis}>
                      <View
                        style={[
                          styles.timelineDotOuter,
                          isFirst ? styles.timelineDotOuterActive : styles.timelineDotOuterMuted,
                        ]}
                      >
                        <View
                          style={[
                            styles.timelineDotInner,
                            isFirst ? styles.timelineDotInnerActive : styles.timelineDotInnerMuted,
                          ]}
                        />
                      </View>
                      {!isLast && <View style={styles.timelineTrack} />}
                    </View>

                    {/* Timeline Body */}
                    <View style={[styles.timelineContent, isLast && styles.timelineContentLast]}>
                      <View style={styles.timelineDateRow}>
                        <AppText
                          variant={isFirst ? 'bodyStrong' : 'body'}
                          color={isFirst ? Colors.textPrimary : Colors.textSecondary}
                        >
                          {occDate.toLocaleDateString(undefined, {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </AppText>
                        <AppText
                          variant={isFirst ? 'bodyStrong' : 'caption'}
                          color={type === 'expense' ? Colors.expense : Colors.income}
                          style={{ fontWeight: isFirst ? '700' : '500' }}
                        >
                          {type === 'income' ? '+' : '−'}
                          {formatCurrency(numericAmount, currency)}
                        </AppText>
                      </View>

                      <AppText
                        variant="micro"
                        color={isFirst ? Colors.primaryDeep : Colors.textMuted}
                        style={{ fontWeight: isFirst ? '600' : '500' }}
                      >
                        {isFirst ? 'Next occurrence' : `${idx + 1}${idx === 1 ? 'nd' : 'rd'} cycle`}
                      </AppText>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.submitWrap}>
          <AppButton
            title={editingRule ? 'Save Changes' : 'Create Recurring Rule'}
            size="lg"
            onPress={handleSave}
            disabled={!canSave}
          />
        </View>
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 80,
    gap: 16,
  },
  formContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 16,
  },
  addRuleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.ctaBg,
    ...Shadows.soft,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.22)',
    gap: 12,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLabelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroLabelText: {
    fontSize: 10.5,
    letterSpacing: 0.9,
    fontFamily: 'Manrope_700Bold',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  activeCountText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  heroAmountRow: {
    marginVertical: 2,
  },
  heroAmountText: {
    fontSize: 32,
    fontFamily: 'Sora_700Bold',
  },
  heroBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  annualBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
  },
  filterWrap: {
    marginVertical: -2,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25, 21, 39, 0.06)',
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rulesContainer: {
    gap: 10,
  },
  rulesHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  rulesHeaderLabel: {
    fontSize: 10.5,
    letterSpacing: 0.9,
    fontFamily: 'Manrope_700Bold',
  },
  ruleCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25, 21, 39, 0.06)',
  },
  ruleCardInactive: {
    opacity: 0.6,
  },
  ruleCardPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ruleDetailsCol: {
    flex: 1,
    gap: 3,
  },
  ruleBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  dueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
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
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    backgroundColor: Colors.incomeSoft,
  },
  ruleRightCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  ruleAmountText: {
    fontSize: 15,
    fontFamily: 'Sora_700Bold',
  },
  switchWrap: {
    marginBottom: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25, 21, 39, 0.06)',
    gap: 16,
  },
  field: {
    gap: 6,
  },
  formSectionLabel: {
    fontSize: 10.5,
    letterSpacing: 0.9,
    fontFamily: 'Manrope_700Bold',
    paddingHorizontal: 2,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ControlHeights.lg,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    gap: 8,
  },
  currencySymbolText: {
    fontFamily: 'Sora_700Bold',
  },
  amountInput: {
    flex: 1,
    fontSize: 22,
    fontFamily: 'Sora_700Bold',
    color: Colors.textPrimary,
    padding: 0,
  },
  input: {
    height: ControlHeights.md,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.xs,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(25, 21, 39, 0.08)',
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  timelineSection: {
    gap: 8,
    marginTop: 4,
  },
  timelineHeaderRow: {
    paddingHorizontal: 4,
  },
  timelineList: {
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 44,
  },
  timelineAxis: {
    width: 18,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  timelineDotOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  timelineDotOuterActive: {
    backgroundColor: Colors.primarySoft,
    borderWidth: 1.5,
    borderColor: 'rgba(139, 92, 246, 0.45)',
  },
  timelineDotOuterMuted: {
    backgroundColor: 'rgba(25, 21, 39, 0.05)',
  },
  timelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  timelineDotInnerActive: {
    backgroundColor: Colors.primary,
  },
  timelineDotInnerMuted: {
    backgroundColor: Colors.textMuted,
  },
  timelineTrack: {
    position: 'absolute',
    top: 14,
    bottom: -4,
    width: 2,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    zIndex: 1,
  },
  timelineContent: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 14,
    gap: 1,
  },
  timelineContentLast: {
    paddingBottom: 4,
  },
  timelineDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  submitWrap: {
    marginTop: 8,
    marginBottom: 20,
  },
});

