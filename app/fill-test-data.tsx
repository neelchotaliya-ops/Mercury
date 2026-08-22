import React, { useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { ProgressBar } from '@/components/finance/progress-bar';
import { getDb } from '@/db/client';
import { seedScaleData } from '@/db/seed-scale';
import { haptics } from '@/utils/haptics';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

const COUNT_PRESETS: { label: string; value: number }[] = [
  { label: '100K', value: 100_000 },
  { label: '1M', value: 1_000_000 },
  { label: '2M', value: 2_000_000 },
  { label: '5M', value: 5_000_000 },
  { label: '10M', value: 10_000_000 },
  { label: '50M', value: 50_000_000 },
  { label: '100M', value: 100_000_000 },
];

/** Calibrated against the desktop benchmark in docs/data-layer-at-scale.md — a rough estimate, not a promise. */
const ESTIMATED_ROWS_PER_SEC = 15_000;

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

export default function FillTestDataScreen() {
  const router = useRouter();

  const [countText, setCountText] = useState('1000000');
  const [yearsText, setYearsText] = useState('10');
  const [minAmountText, setMinAmountText] = useState('1');
  const [maxAmountText, setMaxAmountText] = useState('5000');
  const [expenseWeightText, setExpenseWeightText] = useState('60');
  const [incomeWeightText, setIncomeWeightText] = useState('25');
  const [transferWeightText, setTransferWeightText] = useState('15');
  const [accountCountText, setAccountCountText] = useState('4');

  const [seeding, setSeeding] = useState(false);
  const [progress, setProgress] = useState<{ inserted: number; total: number } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<{ inserted: number; cancelled: boolean } | null>(null);
  const cancelRef = useRef(false);

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

  const runSeed = async () => {
    setSeeding(true);
    setOutcome(null);
    cancelRef.current = false;
    setStartedAt(Date.now());
    setProgress({ inserted: 0, total: count });

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
        onProgress: (inserted, total) => {
          const now = Date.now();
          if (now - lastUiUpdate > 200 || inserted >= total) {
            lastUiUpdate = now;
            setProgress({ inserted, total });
          }
        },
        shouldCancel: () => cancelRef.current,
      });
      setOutcome(result);
      if (result.cancelled) {
        haptics.warning();
      } else {
        haptics.success();
      }
    } catch (e) {
      haptics.error();
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not fill test data.');
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
    cancelRef.current = true;
  };

  const handleClose = () => {
    if (seeding) {
      Alert.alert('Still filling data', 'Cancel the run first, or wait for it to finish.');
      return;
    }
    router.back();
  };

  const showProgress = seeding || outcome !== null;

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader title="Fill test data" subtitle="Random, unpatterned ledger for testing" onClose={handleClose} />

      {showProgress ? (
        <View style={styles.progressWrap}>
          <GlassCard strong style={styles.progressCard} padding={24} elevated>
            <AppText variant="h3" align="center">
              {outcome ? (outcome.cancelled ? 'Cancelled' : 'Done') : 'Filling test data…'}
            </AppText>
            <AppText variant="caption" align="center" color={Colors.textMuted} style={styles.progressSub}>
              {outcome
                ? `${outcome.inserted.toLocaleString()} transaction(s) inserted`
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
            ) : null}

            {!outcome ? (
              <AppButton title="Cancel" onPress={handleCancel} style={styles.actionButton} />
            ) : (
              <AppButton title="Close" onPress={() => router.back()} style={styles.actionButton} />
            )}
          </GlassCard>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <GlassCard style={styles.formCard} padding={18}>
              <AppText variant="label">How much data</AppText>
              <View style={styles.chipRow}>
                {COUNT_PRESETS.map(p => {
                  const active = String(p.value) === countText;
                  return (
                    <Pressable
                      key={p.label}
                      onPress={() => setCountText(String(p.value))}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <AppText variant="micro" color={active ? Colors.ctaText : Colors.textSecondary}>
                        {p.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
              <NumberField label="Exact count" value={countText} onChangeText={setCountText} suffix="transactions" />
            </GlassCard>

            <GlassCard style={styles.formCard} padding={18}>
              <AppText variant="label">Randomness</AppText>
              <AppText variant="caption" color={Colors.textMuted}>
                Every date, amount, account and category is drawn independently and uniformly at random within
                these ranges — no recurring monthly pattern, on purpose, so charts see real noise.
              </AppText>

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
                Type mix (relative weights, any scale)
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
              This replaces every account, category, budget and transaction currently in the app.
            </AppText>
          </ScrollView>

          <View style={styles.footer}>
            <AppButton
              title={`Fill ${count.toLocaleString()} transactions`}
              onPress={handleStart}
              disabled={!canStart}
            />
          </View>
        </>
      )}
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
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
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  progressWrap: {
    flex: 1,
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
  actionButton: {
    marginTop: 8,
  },
});
