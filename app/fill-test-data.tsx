import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { ProgressBar } from '@/components/finance/progress-bar';
import { getDb } from '@/db/client';
import { seedScaleData, ScaleSeedResult } from '@/db/seed-scale';
import { haptics } from '@/utils/haptics';
import { startOperation, updateOperation, finishOperation, cancelOperation, isCancelled } from '@/db/operation-status';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { IconName } from '@/types/finance';

const COUNT_PRESETS: { label: string; value: number; years?: number }[] = [
  { label: 'Demo 500', value: 500, years: 1 },
  { label: '5K', value: 5_000, years: 2 },
  { label: '100K', value: 100_000, years: 5 },
  { label: '1M', value: 1_000_000, years: 10 },
  { label: '5M', value: 5_000_000, years: 10 },
  { label: '10M', value: 10_000_000, years: 10 },
];

const ESTIMATED_ROWS_PER_SEC = 5_000;

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  const h = Math.floor(m / 60);
  if (h === 0) return `${m}m ${s}s`;
  return `${h}h ${m % 60}m`;
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  suffix?: string;
}

const NumberField: React.FC<FieldProps> = ({ label, value, onChangeText, suffix }) => (
  <View style={styles.field}>
    <AppText variant="label">{label}</AppText>
    <View style={styles.fieldInputWrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        style={styles.fieldInput}
        placeholderTextColor={Colors.textMuted}
      />
      {suffix ? (
        <AppText variant="caption" color={Colors.textMuted}>
          {suffix}
        </AppText>
      ) : null}
    </View>
  </View>
);

interface ToggleItemProps {
  icon: IconName;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
}

const FeatureToggleItem: React.FC<ToggleItemProps> = ({ icon, title, subtitle, value, onValueChange }) => (
  <View style={styles.toggleRow}>
    <View style={styles.toggleIconWrap}>
      <Ionicons name={icon} size={18} color={value ? Colors.accent : Colors.textMuted} />
    </View>
    <View style={styles.toggleContent}>
      <AppText variant="body" style={styles.toggleTitle}>
        {title}
      </AppText>
      <AppText variant="micro" color={Colors.textMuted}>
        {subtitle}
      </AppText>
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: Colors.controlBg, true: Colors.ctaBg }}
      thumbColor={value ? Colors.ctaText : '#f4f3f4'}
    />
  </View>
);

export default function FillTestDataScreen() {
  const router = useRouter();

  const [countText, setCountText] = useState('5000');
  const [yearsText, setYearsText] = useState('2');
  const [minAmountText, setMinAmountText] = useState('1');
  const [maxAmountText, setMaxAmountText] = useState('5000');
  const [expenseWeightText, setExpenseWeightText] = useState('60');
  const [incomeWeightText, setIncomeWeightText] = useState('25');
  const [transferWeightText, setTransferWeightText] = useState('15');
  const [accountCountText, setAccountCountText] = useState('4');

  // Feature Toggles
  const [includeSubcategories, setIncludeSubcategories] = useState(true);
  const [includeBudgets, setIncludeBudgets] = useState(true);
  const [includeQuickPresets, setIncludeQuickPresets] = useState(true);
  const [includeRecurringRules, setIncludeRecurringRules] = useState(true);
  const [includeSplitExpenses, setIncludeSplitExpenses] = useState(true);

  const [seeding, setSeeding] = useState(false);
  const [progress, setProgress] = useState<{ inserted: number; total: number } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<ScaleSeedResult | null>(null);

  const count = Math.max(1, Math.round(Number(countText) || 0));
  const years = Math.max(0.1, Number(yearsText) || 0);
  const minAmount = Math.max(0, Number(minAmountText) || 0);
  const maxAmount = Math.max(minAmount, Number(maxAmountText) || 0);
  const expenseWeight = Math.max(0, Number(expenseWeightText) || 0);
  const incomeWeight = Math.max(0, Number(incomeWeightText) || 0);
  const transferWeight = Math.max(0, Number(transferWeightText) || 0);
  const accountCount = Math.min(8, Math.max(1, Math.round(Number(accountCountText) || 0)));

  const canStart =
    count > 0 && years > 0 && maxAmount >= minAmount && expenseWeight + incomeWeight + transferWeight > 0;

  const estimatedSeconds = count / ESTIMATED_ROWS_PER_SEC;

  const elapsedSeconds = startedAt ? (Date.now() - startedAt) / 1000 : 0;
  const rowsPerSec = progress && elapsedSeconds > 0 ? progress.inserted / elapsedSeconds : 0;
  const remainingSeconds =
    progress && rowsPerSec > 0 ? (progress.total - progress.inserted) / rowsPerSec : undefined;

  const handlePresetSelect = (preset: { label: string; value: number; years?: number }) => {
    setCountText(String(preset.value));
    if (preset.years) {
      setYearsText(String(preset.years));
    }
  };

  const runSeed = async () => {
    setSeeding(true);
    setOutcome(null);
    setStartedAt(Date.now());
    setProgress({ inserted: 0, total: count });

    startOperation({ id: 'fill-test-data', label: 'Filling test data…', progress: 0, cancellable: true });

    let lastUiUpdate = 0;
    try {
      const db = await getDb();
      const result = await seedScaleData(db, {
        count,
        years,
        minAmount,
        maxAmount,
        expenseWeight,
        incomeWeight,
        transferWeight,
        accountCount,
        includeSubcategories,
        includeBudgets,
        includeQuickPresets,
        includeRecurringRules,
        includeSplitExpenses,
        onProgress: (inserted, total) => {
          const now = Date.now();
          if (now - lastUiUpdate > 200 || inserted >= total) {
            lastUiUpdate = now;
            setProgress({ inserted, total });
            updateOperation('fill-test-data', {
              progress: inserted / Math.max(total, 1),
              detail: `${inserted.toLocaleString()} / ${total.toLocaleString()}`,
            });
          }
        },
        shouldCancel: () => isCancelled('fill-test-data'),
      });
      setOutcome(result);
      if (result.cancelled) {
        haptics.warning();
        finishOperation('fill-test-data', {
          ok: false,
          message: `Cancelled — ${result.inserted.toLocaleString()} transaction(s) kept.`,
        });
      } else {
        haptics.success();
        finishOperation('fill-test-data', {
          ok: true,
          message: `Filled ${result.inserted.toLocaleString()} transaction(s) and app features.`,
        });
      }
    } catch (e) {
      haptics.error();
      const message = e instanceof Error ? e.message : 'Could not fill test data.';
      finishOperation('fill-test-data', { ok: false, message });
      Alert.alert('Failed', message);
      setProgress(null);
    } finally {
      setSeeding(false);
    }
  };

  const handleStart = () => {
    if (!canStart || seeding) return;
    const proceed = () => void runSeed();
    if (count >= 10_000_000) {
      Alert.alert(
        'This may take a while',
        `Generating ${count.toLocaleString()} transactions is estimated to take roughly ${formatDuration(
          estimatedSeconds
        )} (varies a lot by device). You can cancel at any time — whatever's inserted so far is kept.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Start', onPress: proceed },
        ]
      );
    } else {
      proceed();
    }
  };

  const handleCancel = () => {
    haptics.warning();
    cancelOperation('fill-test-data');
  };

  const handleClose = () => {
    router.back();
  };

  const showProgress = seeding || outcome !== null;

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader
        title="Fill test data"
        subtitle="Advanced multi-feature generator for testing & demo"
        onClose={handleClose}
      />

      {showProgress ? (
        <>
          <ScrollView contentContainerStyle={styles.progressScrollContent}>
            <GlassCard strong style={styles.progressCard} padding={24} elevated>
              <AppText variant="h3" align="center">
                {outcome ? (outcome.cancelled ? 'Cancelled' : 'Dataset Ready') : 'Generating test data…'}
              </AppText>
              <AppText variant="caption" align="center" color={Colors.textMuted} style={styles.progressSub}>
                {outcome
                  ? `${outcome.inserted.toLocaleString()} transaction(s) and all entities populated`
                  : `${(progress?.inserted ?? 0).toLocaleString()} / ${(progress?.total ?? count).toLocaleString()}`}
              </AppText>

              <ProgressBar
                progress={progress ? progress.inserted / Math.max(progress.total, 1) : 0}
                style={styles.progressBar}
              />

              {!outcome ? (
                <View style={styles.progressStats}>
                  <AppText variant="micro" color={Colors.textMuted}>
                    {Math.round((progress ? progress.inserted / Math.max(progress.total, 1) : 0) * 100)}%
                  </AppText>
                  <AppText variant="micro" color={Colors.textMuted}>
                    {rowsPerSec > 0 ? `${Math.round(rowsPerSec).toLocaleString()} rows/sec` : 'starting…'}
                  </AppText>
                  <AppText variant="micro" color={Colors.textMuted}>
                    {remainingSeconds !== undefined ? `ETA ${formatDuration(remainingSeconds)}` : ''}
                  </AppText>
                </View>
              ) : (
                <View style={styles.statsSummaryGrid}>
                  <View style={styles.statSummaryItem}>
                    <Ionicons name="wallet-outline" size={16} color={Colors.accent} />
                    <AppText variant="caption" style={styles.statSummaryText}>
                      <AppText variant="captionStrong">{outcome.accounts}</AppText> Accounts
                    </AppText>
                  </View>
                  <View style={styles.statSummaryItem}>
                    <Ionicons name="pricetags-outline" size={16} color={Colors.accent} />
                    <AppText variant="caption" style={styles.statSummaryText}>
                      <AppText variant="captionStrong">{outcome.categories}</AppText> Categories (
                      <AppText variant="captionStrong">{outcome.subcategories}</AppText> subcats)
                    </AppText>
                  </View>
                  <View style={styles.statSummaryItem}>
                    <Ionicons name="pie-chart-outline" size={16} color={Colors.accent} />
                    <AppText variant="caption" style={styles.statSummaryText}>
                      <AppText variant="captionStrong">{outcome.budgets}</AppText> Active Budgets
                    </AppText>
                  </View>
                  <View style={styles.statSummaryItem}>
                    <Ionicons name="flash-outline" size={16} color={Colors.accent} />
                    <AppText variant="caption" style={styles.statSummaryText}>
                      <AppText variant="captionStrong">{outcome.presets}</AppText> Quick Presets
                    </AppText>
                  </View>
                  <View style={styles.statSummaryItem}>
                    <Ionicons name="repeat-outline" size={16} color={Colors.accent} />
                    <AppText variant="caption" style={styles.statSummaryText}>
                      <AppText variant="captionStrong">{outcome.recurringRules}</AppText> Recurring Rules
                    </AppText>
                  </View>
                  <View style={styles.statSummaryItem}>
                    <Ionicons name="people-outline" size={16} color={Colors.accent} />
                    <AppText variant="caption" style={styles.statSummaryText}>
                      <AppText variant="captionStrong">{outcome.splitExpenses}</AppText> Split Expenses
                    </AppText>
                  </View>
                </View>
              )}
            </GlassCard>
          </ScrollView>

          <View style={styles.footer}>
            {!outcome ? (
              <AppButton title="Cancel" size="md" onPress={handleCancel} />
            ) : (
              <AppButton title="Done" size="md" onPress={() => router.back()} />
            )}
          </View>
        </>
      ) : (
        <KeyboardAvoidingView
          style={styles.formWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
          >
            {/* Scale Preset Selector */}
            <GlassCard style={styles.formCard} padding={18}>
              <AppText variant="label">Dataset Size</AppText>
              <View style={styles.chipRow}>
                {COUNT_PRESETS.map(p => {
                  const active = String(p.value) === countText;
                  return (
                    <Pressable
                      key={p.label}
                      onPress={() => handlePresetSelect(p)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <AppText variant="micro" color={active ? Colors.ctaText : Colors.textSecondary}>
                        {p.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <NumberField label="Custom transaction count" value={countText} onChangeText={setCountText} suffix="txs" />
            </GlassCard>

            {/* Advanced Features To Populate */}
            <GlassCard style={styles.formCard} padding={18}>
              <AppText variant="label">App Features to Populate</AppText>
              <AppText variant="caption" color={Colors.textMuted}>
                Generates realistic demo and test data across all Mercury features.
              </AppText>

              <View style={styles.toggleList}>
                <FeatureToggleItem
                  icon="pricetags-outline"
                  title="Subcategories & Payees"
                  subtitle="Hierarchical sub-items, real merchants (Swiggy, Amazon, Netflix) & contextual notes"
                  value={includeSubcategories}
                  onValueChange={setIncludeSubcategories}
                />
                <FeatureToggleItem
                  icon="pie-chart-outline"
                  title="Category Budgets"
                  subtitle="Realistic monthly limits for Food, Groceries, Shopping & Transport"
                  value={includeBudgets}
                  onValueChange={setIncludeBudgets}
                />
                <FeatureToggleItem
                  icon="flash-outline"
                  title="Quick Presets"
                  subtitle="1-tap logging shortcuts for widgets and quick actions (Coffee, Groceries, Cab)"
                  value={includeQuickPresets}
                  onValueChange={setIncludeQuickPresets}
                />
                <FeatureToggleItem
                  icon="repeat-outline"
                  title="Recurring Rules & Subscriptions"
                  subtitle="Monthly salary, rent, Netflix, Spotify, gym pass & broadband rules"
                  value={includeRecurringRules}
                  onValueChange={setIncludeRecurringRules}
                />
                <FeatureToggleItem
                  icon="people-outline"
                  title="Split Expenses & Repayments"
                  subtitle="Shared group bills with pending, partial & settled friends + linked repayment entries"
                  value={includeSplitExpenses}
                  onValueChange={setIncludeSplitExpenses}
                />
              </View>
            </GlassCard>

            {/* Configuration Parameters */}
            <GlassCard style={styles.formCard} padding={18}>
              <AppText variant="label">Ledger Parameters</AppText>

              <View style={styles.row}>
                <View style={styles.rowItem}>
                  <NumberField label="Years of history" value={yearsText} onChangeText={setYearsText} />
                </View>
                <View style={styles.rowItem}>
                  <NumberField label="Accounts" value={accountCountText} onChangeText={setAccountCountText} suffix="1–8" />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.rowItem}>
                  <NumberField label="Min amount" value={minAmountText} onChangeText={setMinAmountText} />
                </View>
                <View style={styles.rowItem}>
                  <NumberField label="Max amount" value={maxAmountText} onChangeText={setMaxAmountText} />
                </View>
              </View>

              <AppText variant="label" style={styles.mixLabel}>
                Type mix (relative weights)
              </AppText>
              <View style={styles.row}>
                <View style={styles.rowItem}>
                  <NumberField label="Expense" value={expenseWeightText} onChangeText={setExpenseWeightText} />
                </View>
                <View style={styles.rowItem}>
                  <NumberField label="Income" value={incomeWeightText} onChangeText={setIncomeWeightText} />
                </View>
                <View style={styles.rowItem}>
                  <NumberField label="Transfer" value={transferWeightText} onChangeText={setTransferWeightText} />
                </View>
              </View>
            </GlassCard>

            <AppText variant="micro" color={Colors.textMuted} align="center" style={styles.warning}>
              ⚠️ This will replace existing accounts, categories, budgets, recurring rules, splits and transactions.
            </AppText>
          </ScrollView>

          <View style={styles.footer}>
            <AppButton
              title={`Fill ${count.toLocaleString()} transactions & features`}
              onPress={handleStart}
              disabled={!canStart}
            />
          </View>
        </KeyboardAvoidingView>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  formWrap: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: Spacing.lg,
  },
  formCard: {
    gap: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  chipActive: {
    backgroundColor: Colors.ctaBg,
    borderColor: 'transparent',
  },
  field: {
    gap: 6,
  },
  fieldInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
  },
  fieldInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  toggleList: {
    gap: 12,
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 10,
  },
  toggleIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(155, 114, 232, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleContent: {
    flex: 1,
    gap: 2,
  },
  toggleTitle: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rowItem: {
    flex: 1,
  },
  mixLabel: {
    marginTop: 4,
  },
  warning: {
    marginTop: -4,
    paddingHorizontal: 16,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  progressScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  progressCard: {
    gap: 16,
  },
  progressSub: {
    marginTop: -8,
  },
  progressBar: {
    marginTop: 2,
    marginBottom: 2,
  },
  progressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  statsSummaryGrid: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.glassBorder,
    gap: 10,
  },
  statSummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statSummaryText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
});
