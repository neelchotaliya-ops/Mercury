import React, { useSyncExternalStore } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

import { AppText } from '@/components/ui/app-text';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { MenuRow } from '@/components/ui/menu-row';
import { useFinance } from '@/context/finance-context';
import { getDb } from '@/db/client';
import { haptics } from '@/utils/haptics';
import { applyImport, exportData, pickAndPreviewImport } from '@/utils/data-transfer-io';
import { CURRENCIES } from '@/utils/currency';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import {
  startOperation,
  updateOperation,
  finishOperation,
  isCancelled,
  getActiveOperation,
  subscribeOperations,
} from '@/db/operation-status';

export default function SettingsScreen() {
  const router = useRouter();
  const { state, updateSettings, resetAllData } = useFinance();
  // Single source of truth for "is a bulk operation running" — the same
  // store the root-mounted banner reads, so these rows and the banner never
  // disagree, and the state survives this screen unmounting/remounting
  // (e.g. the user backs out mid-export and reopens Settings).
  const activeOperation = useSyncExternalStore(subscribeOperations, getActiveOperation, getActiveOperation);
  const busy = activeOperation?.id ?? null;

  const activeCurrency = CURRENCIES.find(c => c.code === state.settings.currency);
  const currentNumberFormat =
    state.settings.numberFormat ?? (state.settings.currency === 'INR' ? 'indian' : 'international');

  const pickCurrency = () => {
    Alert.alert('Currency', 'Choose the currency used across the app.', [
      ...CURRENCIES.map(c => ({
        text: `${c.symbol}  ${c.label}`,
        onPress: () => updateSettings({ currency: c.code }),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const pickNumberFormat = () => {
    Alert.alert('Digit Grouping', 'Choose how numbers and amounts are grouped across the app.', [
      {
        text: 'Indian (10,00,00,000 / Lakhs & Crores)',
        onPress: () => updateSettings({ numberFormat: 'indian' }),
      },
      {
        text: 'International (100,000,000 / Millions)',
        onPress: () => updateSettings({ numberFormat: 'international' }),
      },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const handleExport = async () => {
    if (busy) return;
    startOperation({ id: 'export', label: 'Exporting…', progress: null, cancellable: true });
    try {
      const db = await getDb();
      const result = await exportData(db, undefined, {
        onProgress: written =>
          updateOperation('export', { detail: `${written.toLocaleString()} transaction(s) so far` }),
        shouldCancel: () => isCancelled('export'),
      });
      if (result.ok) {
        haptics.success();
        finishOperation('export', {
          ok: true,
          message: `Exported ${result.summary.transactions.toLocaleString()} transaction(s).`,
        });
      } else if ('cancelled' in result && result.cancelled) {
        haptics.warning();
        finishOperation('export', { ok: false, message: 'Export cancelled.' });
      } else {
        haptics.error();
        finishOperation('export', { ok: false, message: result.reason });
        Alert.alert('Export failed', result.reason);
      }
    } catch (e) {
      haptics.error();
      const message = e instanceof Error ? e.message : 'Could not write the export file.';
      finishOperation('export', { ok: false, message });
      Alert.alert('Export failed', message);
    }
  };

  const handleImport = async () => {
    if (busy) return;
    // Covers the whole flow — the read/preview pass, the user picking
    // merge-vs-replace, and the actual write — as one continuous operation.
    // Previously `busy` was cleared the moment the preview resolved, so the
    // real batched-write commit() below ran with no busy/progress state at
    // all; keeping the operation open until commit's own finally fixes that.
    startOperation({ id: 'import', label: 'Reading file…', progress: null, cancellable: false });
    try {
      const result = await pickAndPreviewImport();

      if (!result.ok) {
        if ('cancelled' in result) {
          finishOperation('import', { ok: false, message: 'Import cancelled.' });
        } else {
          haptics.error();
          finishOperation('import', { ok: false, message: result.reason });
          Alert.alert('Import failed', result.reason);
        }
        return;
      }

      const { file, format, preview } = result;
      const total = preview.summary.transactions;

      const commit = async (mode: 'merge' | 'replace') => {
        updateOperation('import', {
          label: mode === 'replace' ? 'Replacing data…' : 'Importing…',
          progress: total > 0 ? 0 : null,
          cancellable: total > 0,
        });
        try {
          const db = await getDb();
          const { cancelled } = await applyImport(db, file, mode, {
            format,
            total,
            onProgress: inserted =>
              updateOperation('import', {
                progress: total > 0 ? inserted / total : null,
                detail: total > 0 ? `${inserted.toLocaleString()} / ${total.toLocaleString()}` : undefined,
              }),
            shouldCancel: () => isCancelled('import'),
          });
          if (cancelled) {
            haptics.warning();
            finishOperation('import', { ok: false, message: 'Import cancelled.' });
            Alert.alert('Import cancelled', 'Whatever had already been applied was kept.');
            return;
          }
          if (mode === 'replace') haptics.warning();
          else haptics.success();
          const message =
            mode === 'replace'
              ? `Replaced with this backup's ${total} transaction(s).`
              : `Merged in this backup's ${total} transaction(s).`;
          finishOperation('import', { ok: true, message });
          Alert.alert('Imported', message);
        } catch (e) {
          haptics.error();
          const message = e instanceof Error ? e.message : 'Could not apply that backup.';
          finishOperation('import', { ok: false, message });
          Alert.alert('Import failed', message);
        }
      };

      // Replacing is destructive and unrecoverable, so it is never the default
      // and always states what is about to be lost.
      Alert.alert(
        'Import data',
        `This backup has ${preview.summary.accounts} accounts, ${total} transactions ` +
          `and ${preview.summary.budgets} budgets.\n\nMerge keeps what you already have and adds ` +
          `anything new. Replace deletes your current data first.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => finishOperation('import', { ok: false, message: 'Import cancelled.' }),
          },
          { text: 'Merge', onPress: () => void commit('merge') },
          { text: 'Replace', style: 'destructive', onPress: () => void commit('replace') },
        ],
        {
          cancelable: true,
          // Android's back gesture/hardware back can dismiss this without
          // any button firing — without this the operation would stay
          // "active" (and the banner visible) indefinitely.
          onDismiss: () => finishOperation('import', { ok: false, message: 'Import cancelled.' }),
        }
      );
    } catch (e) {
      haptics.error();
      const message = e instanceof Error ? e.message : 'Could not read that file.';
      finishOperation('import', { ok: false, message });
      Alert.alert('Import failed', message);
    }
  };

  const handleReset = () => {
    Alert.alert('Reset all data', 'This permanently deletes every account, transaction, and budget.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          if (busy) return;
          // Indeterminate: a single DELETE-FROM batch has no natural batch
          // boundary to report a percentage against (see resetAllData) — the
          // point here is showing "this is happening" immediately, not a bar.
          startOperation({ id: 'reset', label: 'Resetting…', progress: null, cancellable: false });
          try {
            await resetAllData();
            haptics.warning();
            finishOperation('reset', { ok: true, message: 'All data has been cleared.' });
            Alert.alert('Reset complete', 'All data has been cleared.');
          } catch (e) {
            haptics.error();
            const message = e instanceof Error ? e.message : 'Could not reset data.';
            finishOperation('reset', { ok: false, message });
            Alert.alert('Reset failed', message);
          }
        },
      },
    ]);
  };

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader title="Settings" onClose={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <GlassCard strong style={styles.summary} elevated>
          <View style={styles.summaryIcon}>
            <Ionicons name="shield-checkmark" size={22} color={Colors.primary} />
          </View>
          <View style={styles.summaryText}>
            <AppText variant="h3">Everything stays on device</AppText>
            <AppText variant="caption">
              Your accounts and transactions are stored locally and never uploaded.
            </AppText>
          </View>
        </GlassCard>

        <View style={styles.section}>
          <AppText variant="label" style={styles.sectionLabel}>
            Preferences
          </AppText>
          <GlassCard padding={0} style={styles.listCard}>
            <MenuRow
              icon="cash-outline"
              label="Currency"
              onPress={pickCurrency}
              divider
              trailing={
                <View style={styles.trailing}>
                  <AppText variant="micro">
                    {activeCurrency?.symbol} {activeCurrency?.code}
                  </AppText>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </View>
              }
            />
            <MenuRow
              icon="calculator-outline"
              label="Digit grouping"
              onPress={pickNumberFormat}
              trailing={
                <View style={styles.trailing}>
                  <AppText variant="micro">
                    {currentNumberFormat === 'indian' ? '1,00,00,000' : '100,000,000'}
                  </AppText>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </View>
              }
            />
          </GlassCard>
        </View>

        <View style={styles.section}>
          <AppText variant="label" style={styles.sectionLabel}>
            Manage
          </AppText>
          <GlassCard padding={0} style={styles.listCard}>
            <MenuRow
              icon="apps-outline"
              label="Manage accounts, categories, recurring & more"
              onPress={() => router.push('/manage' as any)}
            />
          </GlassCard>
        </View>

        <View style={styles.section}>
          <AppText variant="label" style={styles.sectionLabel}>
            Backup & Danger Zone
          </AppText>
          <GlassCard padding={0} style={styles.listCard}>
            <MenuRow
              icon="share-outline"
              label={activeOperation?.id === 'export' ? activeOperation.label : 'Export data'}
              onPress={handleExport}
              disabled={busy !== null}
              divider
            />
            <MenuRow
              icon="download-outline"
              label={activeOperation?.id === 'import' ? activeOperation.label : 'Import data'}
              onPress={handleImport}
              disabled={busy !== null}
              divider
            />
            <MenuRow
              icon="trash-outline"
              label={activeOperation?.id === 'reset' ? activeOperation.label : 'Reset all data'}
              tint={Colors.expense}
              onPress={handleReset}
              disabled={busy !== null}
              trailing={<View />}
            />
          </GlassCard>
        </View>

        <View style={styles.section}>
          <AppText variant="label" style={styles.sectionLabel}>
            Advanced
          </AppText>
          <GlassCard padding={0} style={styles.listCard}>
            <MenuRow
              icon="speedometer-outline"
              label="Fill test data (custom size)"
              onPress={() => router.push('/fill-test-data' as any)}
              disabled={busy !== null}
              divider
            />
            <MenuRow
              icon="pulse-outline"
              label="Database diagnostics"
              onPress={() => router.push('/db-diagnostics' as any)}
            />
          </GlassCard>
        </View>

        <AppText variant="micro" align="center" style={styles.version}>
          Mercury v{Constants.expoConfig?.version ?? '1.0.0'}
        </AppText>
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 90,
    gap: Spacing.xl,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  summaryIcon: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: {
    flex: 1,
    gap: Spacing.xs,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    marginLeft: 4,
  },
  listCard: {
    overflow: 'hidden',
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  version: {
    marginTop: Spacing.sm,
  },
});
