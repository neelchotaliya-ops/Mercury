import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { CategoryPicker } from '@/components/finance/category-picker';
import { AccountPicker } from '@/components/finance/account-picker';
import { EmptyState } from '@/components/finance/empty-state';
import { useFinance } from '@/context/finance-context';
import { Account, QuickPreset } from '@/types/finance';
import { formatCurrency, getCurrencySymbol } from '@/utils/currency';
import { refreshWidgets } from '@/utils/widget-bridge';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

const EMOJI_CHOICES = [
  '☕', '🍔', '🍫', '🥤', '🚌', '🚕', '⛽', '🛒',
  '🎬', '💊', '📱', '🏠', '🎁', '💼', '💰', '✨',
];

type Draft = Omit<QuickPreset, 'id'> & { id?: string };

/** Mirrors the fallback in utils/widget-data.ts's buildPresetTransaction, so
 * what this list shows always matches what a tap actually records. */
function resolveFundingAccount(accounts: Account[], accountId: string | undefined): Account | undefined {
  const live = accounts.filter(a => !a.archived);
  return live.find(a => a.id === accountId) ?? live[0];
}

const BLANK_DRAFT: Draft = {
  label: '',
  emoji: '☕',
  amount: 0,
  type: 'expense',
};

export default function QuickPresetsScreen() {
  const router = useRouter();
  const { state, addPreset, updatePreset, deletePreset } = useFinance();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [amountText, setAmountText] = useState('');

  const currency = state.settings.currency;
  const presets = state.quickPresets;

  const openEditor = (preset?: QuickPreset) => {
    setDraft(preset ? { ...preset } : { ...BLANK_DRAFT });
    setAmountText(preset ? String(preset.amount) : '');
  };

  const closeEditor = () => {
    setDraft(null);
    setAmountText('');
  };

  const categories = draft
    ? state.categories.filter(c => c.kind === draft.type)
    : [];

  const amount = parseFloat(amountText || '0');
  const canSave = !!draft && draft.label.trim().length > 0 && amount > 0;

  const handleSave = () => {
    if (!draft || !canSave) return;

    const payload = { ...draft, label: draft.label.trim(), amount };
    if (draft.id) updatePreset({ ...payload, id: draft.id });
    else addPreset(payload);

    closeEditor();
    // Placed widgets show these tiles, so redraw them straight away.
    refreshWidgets();
  };

  const handleDelete = (preset: QuickPreset) => {
    Alert.alert('Delete preset', `Remove "${preset.label}" from the widget?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deletePreset(preset.id);
          if (draft?.id === preset.id) closeEditor();
          refreshWidgets();
        },
      },
    ]);
  };

  return (
    <GradientScreen edges={['top']} contours="top">
      <ModalHeader
        title="Quick presets"
        subtitle="One tap on the widget logs these"
        onClose={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {presets.length === 0 ? (
          <GlassCard>
            <EmptyState
              icon="flash-outline"
              title="No presets yet"
              subtitle="Add the things you buy often, then log them in one tap from your home screen."
            />
          </GlassCard>
        ) : (
          <GlassCard padding={0} style={styles.listCard}>
            {presets.map((preset, index) => (
              <Pressable
                key={preset.id}
                onPress={() => openEditor(preset)}
                style={({ pressed }) => [
                  styles.row,
                  index < presets.length - 1 && styles.rowDivider,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <View style={styles.emojiTile}>
                  <AppText variant="body">{preset.emoji}</AppText>
                </View>

                <View style={styles.rowText}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {preset.label}
                  </AppText>
                  <AppText variant="micro" numberOfLines={1}>
                    {preset.type === 'income' ? 'Income' : 'Expense'}
                    {' · '}
                    {state.categories.find(c => c.id === preset.categoryId)?.name ?? 'No category'}
                    {' · '}
                    {resolveFundingAccount(state.accounts, preset.accountId)?.name ?? 'No account'}
                  </AppText>
                </View>

                <AppText variant="amount">{formatCurrency(preset.amount, currency)}</AppText>

                <Pressable onPress={() => handleDelete(preset)} hitSlop={10} style={styles.deleteBtn}>
                  <Ionicons name="close" size={15} color={Colors.textMuted} />
                </Pressable>
              </Pressable>
            ))}
          </GlassCard>
        )}

        {draft ? (
          <GlassCard strong elevated style={styles.editor}>
            <View style={styles.editorHeader}>
              <AppText variant="label">{draft.id ? 'Edit preset' : 'New preset'}</AppText>
              <Pressable onPress={closeEditor} hitSlop={10}>
                <Ionicons name="close" size={17} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <SegmentedControl<'expense' | 'income'>
              options={[
                { key: 'expense', label: 'Expense', activeColor: Colors.expense },
                { key: 'income', label: 'Income', activeColor: Colors.income },
              ]}
              value={draft.type}
              onChange={next => setDraft({ ...draft, type: next, categoryId: undefined })}
            />

            <View style={styles.field}>
              <AppText variant="label">Label</AppText>
              <TextInput
                value={draft.label}
                onChangeText={text => setDraft({ ...draft, label: text })}
                placeholder="Coffee"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <AppText variant="label">Amount</AppText>
              <View style={styles.amountRow}>
                <AppText variant="bodyStrong">{getCurrencySymbol(currency)}</AppText>
                <TextInput
                  value={amountText}
                  onChangeText={text => setAmountText(text.replace(/[^0-9.]/g, ''))}
                  placeholder="0"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  style={[styles.input, styles.amountInput]}
                />
              </View>
            </View>

            <View style={styles.field}>
              <AppText variant="label">Icon</AppText>
              <View style={styles.emojiGrid}>
                {EMOJI_CHOICES.map(emoji => {
                  const active = draft.emoji === emoji;
                  return (
                    <Pressable
                      key={emoji}
                      onPress={() => setDraft({ ...draft, emoji })}
                      style={[styles.emojiChoice, active && styles.emojiChoiceActive]}
                    >
                      <AppText variant="body">{emoji}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <AppText variant="label">Category</AppText>
              <CategoryPicker
                categories={categories}
                selectedId={draft.categoryId}
                onSelect={c => setDraft({ ...draft, categoryId: c.id })}
              />
            </View>

            <View style={styles.field}>
              <AppText variant="label">Account</AppText>
              <AccountPicker
                accounts={state.accounts}
                selectedId={draft.accountId ?? state.accounts[0]?.id}
                onSelect={a => setDraft({ ...draft, accountId: a.id })}
              />
            </View>

            <AppButton title="Save preset" onPress={handleSave} size="md" disabled={!canSave} />
          </GlassCard>
        ) : (
          <AppButton
            title="Add preset"
            icon="add"
            onPress={() => openEditor()}
            size="md"
            variant="glass"
          />
        )}
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 60,
    gap: Spacing.lg,
  },
  listCard: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  emojiTile: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primarySoft,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  deleteBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.track,
  },
  editor: {
    gap: Spacing.lg,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  field: {
    gap: 10,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  amountInput: {
    flex: 1,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emojiChoice: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  emojiChoiceActive: {
    backgroundColor: Colors.primarySoft,
    borderColor: Colors.primary,
  },
});
