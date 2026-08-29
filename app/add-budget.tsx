import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { AmountDisplay, Numpad } from '@/components/finance/amount-input';
import { CategoryPicker } from '@/components/finance/category-picker';
import { EmptyState } from '@/components/finance/empty-state';
import { useFinance } from '@/context/finance-context';
import { getCurrencySymbol } from '@/utils/currency';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

export default function AddBudgetScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { state, addBudget, updateBudget, deleteBudget } = useFinance();

  const editing = useMemo(
    () => state.budgets.find(b => b.id === params.id),
    [state.budgets, params.id]
  );

  const uniqueCurrencies = useMemo(() => {
    const list = Array.from(
      new Set(state.accounts.map(a => a.currency ?? state.settings.currency ?? 'INR'))
    );
    return list.length > 0 ? list : [state.settings.currency ?? 'INR'];
  }, [state.accounts, state.settings.currency]);

  const [selectedCurrency, setSelectedCurrency] = useState<string>(
    editing?.currency ?? uniqueCurrencies[0] ?? 'INR'
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(
    editing?.accountId
  );

  // Accounts matching the active currency
  const currencyAccounts = useMemo(
    () => state.accounts.filter(a => (a.currency ?? 'INR') === selectedCurrency),
    [state.accounts, selectedCurrency]
  );

  const takenIds = new Set(
    state.budgets
      .filter(b => b.id !== editing?.id && (b.currency ?? 'INR') === selectedCurrency && b.accountId === selectedAccountId)
      .map(b => b.categoryId)
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
    const payload = {
      categoryId,
      monthlyLimit: numericAmount,
      accountId: selectedAccountId,
      currency: selectedCurrency,
    };
    if (editing) updateBudget({ ...editing, ...payload });
    else addBudget(payload);
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

      <View style={styles.screenBody}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <GlassCard strong style={styles.amountCard} elevated>
            <AmountDisplay
              value={amount}
              currencySymbol={getCurrencySymbol(selectedCurrency)}
              currencyCode={selectedCurrency}
              numberFormat={state.settings.numberFormat}
              accentColor={Colors.primary}
            />
          </GlassCard>

          {/* Currency & Account Scope Selection */}
          <GlassCard style={styles.formCard} padding={18}>
            <AppText variant="label">Currency & Account</AppText>
            {uniqueCurrencies.length > 1 && (
              <View style={styles.chipRow}>
                {uniqueCurrencies.map(curr => {
                  const active = curr === selectedCurrency;
                  return (
                    <Pressable
                      key={curr}
                      onPress={() => {
                        setSelectedCurrency(curr);
                        setSelectedAccountId(undefined);
                      }}
                      style={[
                        styles.scopeChip,
                        {
                          backgroundColor: active ? Colors.ctaBg : Colors.controlBg,
                          borderColor: active ? 'transparent' : Colors.glassBorder,
                        },
                      ]}
                    >
                      <AppText variant="bodyStrong" color={active ? Colors.ctaText : Colors.primary}>
                        {getCurrencySymbol(curr)}
                      </AppText>
                      <AppText variant="caption" color={active ? Colors.ctaText : Colors.textPrimary}>
                        {curr}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={styles.scopeList}>
              <Pressable
                onPress={() => setSelectedAccountId(undefined)}
                style={[
                  styles.scopeOption,
                  selectedAccountId === undefined && styles.scopeOptionActive,
                ]}
              >
                <Ionicons
                  name="wallet-outline"
                  size={18}
                  color={selectedAccountId === undefined ? Colors.primary : Colors.textMuted}
                />
                <AppText
                  variant="body"
                  color={selectedAccountId === undefined ? Colors.textPrimary : Colors.textSecondary}
                  style={styles.scopeText}
                >
                  All {selectedCurrency} Accounts
                </AppText>
                {selectedAccountId === undefined && (
                  <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                )}
              </Pressable>

              {currencyAccounts.map(acct => {
                const active = selectedAccountId === acct.id;
                return (
                  <Pressable
                    key={acct.id}
                    onPress={() => setSelectedAccountId(acct.id)}
                    style={[styles.scopeOption, active && styles.scopeOptionActive]}
                  >
                    <Ionicons
                      name={acct.icon}
                      size={18}
                      color={active ? acct.color : Colors.textMuted}
                    />
                    <AppText
                      variant="body"
                      color={active ? Colors.textPrimary : Colors.textSecondary}
                      style={styles.scopeText}
                    >
                      {acct.name}
                    </AppText>
                    {active && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                  </Pressable>
                );
              })}
            </View>
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

        <View style={styles.fixedBottomContainer}>
          <Numpad value={amount} onChangeValue={setAmount} />
          <AppButton
            title={editing ? 'Save changes' : 'Create budget'}
            onPress={handleSave}
            size="md"
            disabled={!canSave}
            style={styles.submitBtn}
          />
        </View>
      </View>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  screenBody: {
    flex: 1,
    position: 'relative',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 350,
    gap: Spacing.lg,
  },
  amountCard: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  formCard: {
    gap: 12,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  scopeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  scopeList: {
    gap: 8,
    marginTop: 4,
  },
  scopeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  scopeOptionActive: {
    backgroundColor: 'rgba(107, 78, 255, 0.08)',
    borderColor: Colors.primary,
  },
  scopeText: {
    flex: 1,
  },
  fixedBottomContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surfaceOpaque,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: Colors.glassBorder,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 12,
  },
  submitBtn: {
    marginTop: 4,
  },
});
