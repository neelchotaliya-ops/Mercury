import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

import { AppText } from '@/components/ui/app-text';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { useFinance } from '@/context/finance-context';
import { haptics } from '@/utils/haptics';
import { mergeData, summarize } from '@/utils/data-transfer';
import { exportData, pickAndParseImport } from '@/utils/data-transfer-io';
import { CURRENCIES } from '@/utils/currency';
import { Colors, Spacing } from '@/constants/theme';

interface RowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint?: string;
  onPress: () => void;
  trailing?: React.ReactNode;
  divider?: boolean;
}

const Row: React.FC<RowProps> = ({ icon, label, tint, onPress, trailing, divider }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.row, divider && styles.rowDivider, { opacity: pressed ? 0.6 : 1 }]}
  >
    <View style={[styles.rowIcon, { backgroundColor: `${tint ?? Colors.primary}1A` }]}>
      <Ionicons name={icon} size={16} color={tint ?? Colors.primary} />
    </View>
    <AppText variant="body" color={tint ?? Colors.textPrimary} style={styles.rowLabel}>
      {label}
    </AppText>
    {trailing ?? <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />}
  </Pressable>
);

export default function SettingsScreen() {
  const router = useRouter();
  const { state, updateSettings, resetAllData, seedDemoData, replaceAllData } = useFinance();
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const activeCurrency = CURRENCIES.find(c => c.code === state.settings.currency);

  const pickCurrency = () => {
    Alert.alert('Currency', 'Choose the currency used across the app.', [
      ...CURRENCIES.map(c => ({
        text: `${c.symbol}  ${c.label}`,
        onPress: () => updateSettings({ currency: c.code }),
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const handleSeedDemoData = () => {
    Alert.alert('Populate 2-Year Sample Data', 'This will populate 2 full years of realistic accounts, transactions, and budgets.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Populate 2-Year Data', onPress: seedDemoData },
    ]);
  };


  const handleExport = async () => {
    if (busy) return;
    setBusy('export');
    try {
      const { isLoaded, ...persistable } = state;
      const result = await exportData(persistable);
      if (result.ok) {
        haptics.success();
      } else {
        haptics.error();
        Alert.alert('Export failed', result.reason);
      }
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    if (busy) return;
    setBusy('import');
    try {
      const result = await pickAndParseImport();

      if (!result.ok) {
        if (!('cancelled' in result)) {
          haptics.error();
          Alert.alert('Import failed', result.reason);
        }
        return;
      }

      const { summary, data: incoming } = result;
      const current = (() => {
        const { isLoaded, ...persistable } = state;
        return persistable;
      })();

      // Replacing is destructive and unrecoverable, so it is never the default
      // and always states what is about to be lost.
      Alert.alert(
        'Import data',
        `This backup has ${summary.accounts} accounts, ${summary.transactions} transactions ` +
          `and ${summary.budgets} budgets.\n\nMerge keeps what you already have and adds ` +
          `anything new. Replace deletes your current data first.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Merge',
            onPress: () => {
              const merged = mergeData(current, incoming);
              replaceAllData(merged);
              haptics.success();
              const after = summarize(merged);
              Alert.alert('Imported', `You now have ${after.transactions} transactions.`);
            },
          },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => {
              replaceAllData(incoming);
              haptics.warning();
              Alert.alert('Imported', `Replaced with ${summary.transactions} transactions.`);
            },
          },
        ]
      );
    } finally {
      setBusy(null);
    }
  };

  const handleReset = () => {
    Alert.alert('Reset all data', 'This permanently deletes every account, transaction, and budget.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetAllData },
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
            <Row
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
            <Row
              icon="pricetags-outline"
              label="Manage categories"
              onPress={() => router.push('/manage-categories')}
              divider
            />
            <Row
              icon="wallet-outline"
              label="Manage accounts"
              onPress={() => router.push('/accounts')}
              divider
            />
            <Row
              icon="flash-outline"
              label="Widget quick presets"
              onPress={() => router.push('/quick-presets')}
            />
          </GlassCard>
        </View>

        <View style={styles.section}>
          <AppText variant="label" style={styles.sectionLabel}>
            Data
          </AppText>
          <GlassCard padding={0} style={styles.listCard}>
            <Row
              icon="share-outline"
              label={busy === 'export' ? 'Preparing export…' : 'Export data'}
              onPress={handleExport}
              divider
            />
            <Row
              icon="download-outline"
              label={busy === 'import' ? 'Reading file…' : 'Import data'}
              onPress={handleImport}
              divider
            />
            <Row
              icon="sparkles-outline"
              label="Populate sample data"
              onPress={handleSeedDemoData}
              divider
            />
            <Row
              icon="trash-outline"
              label="Reset all data"
              tint={Colors.expense}
              onPress={handleReset}
              trailing={<View />}
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
    paddingBottom: 40,
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
    borderRadius: 16,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: {
    flex: 1,
    gap: 3,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    marginLeft: 4,
  },
  listCard: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
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
