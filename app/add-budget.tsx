import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { AmountInput } from '@/components/finance/amount-input';
import { CategoryPicker } from '@/components/finance/category-picker';
import { EmptyState } from '@/components/finance/empty-state';
import { useFinance } from '@/context/finance-context';
import { getCurrencySymbol } from '@/utils/currency';
import { Colors, Spacing } from '@/constants/theme';

export default function AddBudgetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { state, addBudget, updateBudget, deleteBudget } = useFinance();

  const editing = useMemo(
    () => state.budgets.find(b => b.id === params.id),
    [state.budgets, params.id]
  );

  const takenIds = new Set(
    state.budgets.filter(b => b.id !== editing?.id).map(b => b.categoryId)
  );
  const available = state.categories.filter(c => c.kind === 'expense' && !takenIds.has(c.id));
  const selectable = editing
    ? [...available, ...state.categories.filter(c => c.id === editing.categoryId)]
    : available;

  const [categoryId, setCategoryId] = useState<string | undefined>(editing?.categoryId);
  const [amount, setAmount] = useState(editing ? String(editing.monthlyLimit) : '');

  const numericAmount = parseFloat(amount || '0');
  const canSave = !!categoryId && numericAmount > 0;

  const handleSave = () => {
    if (!canSave || !categoryId) return;
    if (editing) updateBudget({ ...editing, categoryId, monthlyLimit: numericAmount });
    else addBudget({ categoryId, monthlyLimit: numericAmount });
    router.back();
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert('Delete budget', 'This budget will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteBudget(editing.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader
        title={editing ? 'Edit budget' : 'New budget'}
        subtitle="Monthly limit"
        onClose={() => router.back()}
        onDelete={editing ? handleDelete : undefined}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <GlassCard strong style={styles.amountCard} elevated>
          <AmountInput
            value={amount}
            onChangeValue={setAmount}
            currencySymbol={getCurrencySymbol(state.settings.currency)}
            accentColor={Colors.primary}
          />
        </GlassCard>

        <GlassCard style={styles.formCard} padding={18}>
          <AppText variant="label">Category</AppText>
          {selectable.length === 0 ? (
            <EmptyState
              icon="checkmark-done-outline"
              title="Every category is budgeted"
              subtitle="Edit an existing budget instead, or add a new category first."
            />
          ) : (
            <CategoryPicker
              categories={selectable}
              selectedId={categoryId}
              onSelect={c => setCategoryId(c.id)}
              onManage={() => router.push('/manage-categories?kind=expense')}
            />
          )}
        </GlassCard>
      </ScrollView>

      <View style={styles.footer}>
        <AppButton
          title={editing ? 'Save changes' : 'Create budget'}
          onPress={handleSave}
          disabled={!canSave}
        />
      </View>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: Spacing.lg,
  },
  amountCard: {
    paddingVertical: 22,
    paddingHorizontal: 12,
  },
  formCard: {
    gap: 12,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
});
