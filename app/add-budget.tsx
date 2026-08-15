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
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { getCurrencySymbol } from '@/utils/currency';

export default function AddBudgetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { spacing } = useAppTheme();
  const { state, addBudget, updateBudget, deleteBudget } = useFinance();

  const editing = useMemo(() => state.budgets.find(b => b.id === params.id), [state.budgets, params.id]);

  const budgetedCategoryIds = new Set(state.budgets.filter(b => b.id !== editing?.id).map(b => b.categoryId));
  const availableCategories = state.categories.filter(c => c.kind === 'expense' && !budgetedCategoryIds.has(c.id));

  const [categoryId, setCategoryId] = useState<string | undefined>(editing?.categoryId);
  const [amount, setAmount] = useState(editing ? String(editing.monthlyLimit) : '');

  const numericAmount = parseFloat(amount || '0');
  const canSave = !!categoryId && numericAmount > 0;

  const handleSave = () => {
    if (!canSave || !categoryId) return;
    if (editing) {
      updateBudget({ ...editing, categoryId, monthlyLimit: numericAmount });
    } else {
      addBudget({ categoryId, monthlyLimit: numericAmount });
    }
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
    <GradientScreen edges={['top', 'bottom']}>
      <ModalHeader
        title={editing ? 'Edit budget' : 'New budget'}
        onClose={() => router.back()}
        onDelete={editing ? handleDelete : undefined}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <GlassCard style={styles.formCard}>
          <AmountInput value={amount} onChangeValue={setAmount} currencySymbol={getCurrencySymbol(state.settings.currency)} />
          <AppText variant="caption" align="center" style={{ marginTop: -8 }}>
            Monthly limit
          </AppText>

          <View style={styles.fieldGroup}>
            <AppText variant="caption" style={styles.fieldLabel}>
              Category
            </AppText>
            {editing && availableCategories.length === 0 ? (
              <View style={styles.currentCategory}>
                <AppText variant="body">{state.categories.find(c => c.id === editing.categoryId)?.name}</AppText>
              </View>
            ) : (
              <CategoryPicker
                categories={
                  editing
                    ? [...availableCategories, ...state.categories.filter(c => c.id === editing.categoryId)]
                    : availableCategories
                }
                selectedId={categoryId}
                onSelect={c => setCategoryId(c.id)}
              />
            )}
          </View>
        </GlassCard>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: spacing.xl }]}>
        <AppButton title="Save" onPress={handleSave} disabled={!canSave} />
      </View>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  formCard: {
    gap: 22,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    marginLeft: 4,
  },
  currentCategory: {
    paddingVertical: 10,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
