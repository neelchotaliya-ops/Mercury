import React from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';

import { AppText } from '@/components/ui/app-text';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { CURRENCIES } from '@/utils/currency';
import { ThemePreference } from '@/types/finance';

const THEME_OPTIONS: { key: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'light', label: 'Light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Dark', icon: 'moon-outline' },
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, borderRadius } = useAppTheme();
  const { state, updateSettings, resetAllData } = useFinance();

  const handleReset = () => {
    Alert.alert('Reset all data', 'This will permanently delete every account, transaction, and budget.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetAllData },
    ]);
  };

  return (
    <GradientScreen edges={['top', 'bottom']}>
      <ModalHeader title="Settings" onClose={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="caption" style={styles.sectionLabel}>
          Appearance
        </AppText>
        <View style={[styles.segmented, { backgroundColor: colors.buttonSecondaryBg, borderRadius: borderRadius.pill }]}>
          {THEME_OPTIONS.map(opt => {
            const isActive = state.settings.themePreference === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => updateSettings({ themePreference: opt.key })}
                style={[styles.segment, { borderRadius: borderRadius.pill, backgroundColor: isActive ? colors.cardBackground : 'transparent' }]}
              >
                <Ionicons name={opt.icon} size={16} color={colors.textPrimary} />
                <AppText variant="body" weight="semibold" style={{ color: colors.textPrimary }}>
                  {opt.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <AppText variant="caption" style={styles.sectionLabel}>
          Currency
        </AppText>
        <GlassCard padding={0} style={styles.listCard}>
          {CURRENCIES.map((c, index) => {
            const isActive = c.code === state.settings.currency;
            return (
              <Pressable
                key={c.code}
                onPress={() => updateSettings({ currency: c.code })}
                style={[styles.row, index < CURRENCIES.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              >
                <View style={styles.rowLeft}>
                  <AppText variant="body" weight="semibold" style={{ color: colors.textPrimary, width: 30 }}>
                    {c.symbol}
                  </AppText>
                  <AppText variant="body" style={{ color: colors.textPrimary }}>
                    {c.label} ({c.code})
                  </AppText>
                </View>
                {isActive ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </GlassCard>

        <AppText variant="caption" style={styles.sectionLabel}>
          Data
        </AppText>
        <GlassCard padding={0} style={styles.listCard}>
          <Pressable onPress={() => router.push('/manage-categories')} style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="pricetags-outline" size={18} color={colors.textPrimary} />
              <AppText variant="body" style={{ color: colors.textPrimary }}>
                Manage categories
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={handleReset} style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={styles.rowLeft}>
              <Ionicons name="trash-outline" size={18} color="#DC2626" />
              <AppText variant="body" style={{ color: '#DC2626' }}>
                Reset all data
              </AppText>
            </View>
          </Pressable>
        </GlassCard>

        <AppText variant="caption" align="center" style={styles.version}>
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
  },
  sectionLabel: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  segmented: {
    flexDirection: 'row',
    padding: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  listCard: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  version: {
    marginTop: 24,
  },
});
