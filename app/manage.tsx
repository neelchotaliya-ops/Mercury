import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { MenuRow } from '@/components/ui/menu-row';
import { Spacing } from '@/constants/theme';

/**
 * The single home for "configure the structures your money moves through" —
 * accounts, categories, recurring rules, splits, widget presets, bank
 * import. Settings stays scoped to app-level preferences and backup/danger
 * actions; this hub is where every entity-management screen lives, reached
 * from both Settings and (for accounts specifically) Home's own shortcut.
 */
export default function ManageScreen() {
  const router = useRouter();

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader title="Manage" onClose={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <GlassCard padding={0} style={styles.listCard}>
          <MenuRow
            icon="wallet-outline"
            label="Accounts"
            subtitle="Cash, bank, card, and wallet balances"
            onPress={() => router.push('/accounts')}
            divider
          />
          <MenuRow
            icon="pricetags-outline"
            label="Categories & Subcategories"
            subtitle="What your spending and income are for"
            onPress={() => router.push('/manage-categories')}
            divider
          />
          <MenuRow
            icon="repeat-outline"
            label="Recurring Payments"
            subtitle="Rent, subscriptions, salary — on a schedule"
            onPress={() => router.push('/add-recurring' as any)}
            divider
          />
          <MenuRow
            icon="people-outline"
            label="Split Expenses"
            subtitle="Bills you paid that others owe you back for"
            onPress={() => router.push('/manage-splits' as any)}
            divider
          />
          <MenuRow
            icon="flash-outline"
            label="Widget Quick Presets"
            subtitle="One-tap logging from your home screen"
            onPress={() => router.push('/quick-presets')}
            divider
          />
          <MenuRow
            icon="document-text-outline"
            label="Bank Import (CSV)"
            subtitle="Bring in transactions from a bank statement"
            onPress={() => router.push('/bank-import' as any)}
          />
        </GlassCard>
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: Spacing.sm,
    paddingBottom: 40,
  },
  listCard: {
    overflow: 'hidden',
  },
});
