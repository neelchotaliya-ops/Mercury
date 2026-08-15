import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { AmountInput } from '@/components/finance/amount-input';
import { CategoryPicker } from '@/components/finance/category-picker';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { getCurrencySymbol } from '@/utils/currency';

export default function AddBudgetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { colors, spacing } = useAppTheme();
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
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={24} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="h3" style={{ color: colors.textPrimary }}>
          {editing ? 'Edit budget' : 'New budget'}
        </AppText>
        {editing ? (
          <Pressable onPress={handleDelete} hitSlop={10}>
            <Ionicons name="trash-outline" size={22} color="#DC2626" />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
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
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: spacing.xl }]}>
        <AppButton title="Save" onPress={handleSave} disabled={!canSave} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 20,
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
