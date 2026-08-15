import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { AmountInput } from '@/components/finance/amount-input';
import { CategoryPicker } from '@/components/finance/category-picker';
import { AccountPicker } from '@/components/finance/account-picker';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { TransactionType } from '@/types/finance';
import { getCurrencySymbol } from '@/utils/currency';

const TYPES: { key: TransactionType; label: string; color: string }[] = [
  { key: 'expense', label: 'Expense', color: '#DC2626' },
  { key: 'income', label: 'Income', color: '#16A34A' },
  { key: 'transfer', label: 'Transfer', color: '#2563EB' },
];

export default function AddTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const { colors, spacing, borderRadius } = useAppTheme();
  const { state, addTransaction, updateTransaction, deleteTransaction } = useFinance();

  const editing = useMemo(() => state.transactions.find(t => t.id === params.id), [state.transactions, params.id]);

  const [type, setType] = useState<TransactionType>(
    editing?.type ?? (params.type === 'transfer' || params.type === 'income' ? (params.type as TransactionType) : 'expense')
  );
  const [amount, setAmount] = useState<string>(editing ? String(editing.amount) : '');
  const [accountId, setAccountId] = useState<string | undefined>(editing?.accountId ?? state.accounts[0]?.id);
  const [toAccountId, setToAccountId] = useState<string | undefined>(editing?.toAccountId);
  const [categoryId, setCategoryId] = useState<string | undefined>(editing?.categoryId);
  const [note, setNote] = useState(editing?.note ?? '');
  const [date, setDate] = useState<Date>(editing ? new Date(editing.date) : new Date());

  const categories = state.categories.filter(c => c.kind === (type === 'income' ? 'income' : 'expense'));
  const accent = TYPES.find(t => t.key === type)?.color;
  const numericAmount = parseFloat(amount || '0');

  const canSave =
    numericAmount > 0 &&
    !!accountId &&
    (type !== 'transfer' ? !!categoryId : !!toAccountId && toAccountId !== accountId);

  const shiftDay = (delta: number) => {
    setDate(prev => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + delta);
      return next;
    });
  };

  const handleSave = () => {
    if (!canSave || !accountId) return;

    const payload = {
      type,
      amount: numericAmount,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      categoryId: type !== 'transfer' ? categoryId : undefined,
      date: date.toISOString(),
      note: note.trim() || undefined,
    };

    if (editing) {
      updateTransaction({ ...editing, ...payload });
    } else {
      addTransaction(payload);
    }
    router.back();
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert('Delete transaction', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteTransaction(editing.id);
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
          {editing ? 'Edit transaction' : 'Add transaction'}
        </AppText>
        {editing ? (
          <Pressable onPress={handleDelete} hitSlop={10}>
            <Ionicons name="trash-outline" size={22} color="#DC2626" />
          </Pressable>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.segmented, { backgroundColor: colors.buttonSecondaryBg, borderRadius: borderRadius.pill }]}>
          {TYPES.map(t => {
            const isActive = t.key === type;
            return (
              <Pressable
                key={t.key}
                onPress={() => {
                  setType(t.key);
                  setCategoryId(undefined);
                }}
                style={[
                  styles.segment,
                  { borderRadius: borderRadius.pill, backgroundColor: isActive ? colors.cardBackground : 'transparent' },
                ]}
              >
                <AppText variant="body" weight="semibold" style={{ color: isActive ? t.color : colors.textSecondary }}>
                  {t.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <AmountInput value={amount} onChangeValue={setAmount} currencySymbol={getCurrencySymbol(state.settings.currency)} accentColor={accent} />

        <View style={styles.fieldGroup}>
          <AppText variant="caption" style={styles.fieldLabel}>
            {type === 'transfer' ? 'From account' : 'Account'}
          </AppText>
          <AccountPicker accounts={state.accounts} selectedId={accountId} onSelect={a => setAccountId(a.id)} />
        </View>

        {type === 'transfer' ? (
          <View style={styles.fieldGroup}>
            <AppText variant="caption" style={styles.fieldLabel}>
              To account
            </AppText>
            <AccountPicker accounts={state.accounts} selectedId={toAccountId} onSelect={a => setToAccountId(a.id)} excludeId={accountId} />
          </View>
        ) : (
          <View style={styles.fieldGroup}>
            <AppText variant="caption" style={styles.fieldLabel}>
              Category
            </AppText>
            <CategoryPicker
              categories={categories}
              selectedId={categoryId}
              onSelect={c => setCategoryId(c.id)}
              onManage={() => router.push(`/manage-categories?kind=${type === 'income' ? 'income' : 'expense'}`)}
            />
          </View>
        )}

        <View style={styles.fieldGroup}>
          <AppText variant="caption" style={styles.fieldLabel}>
            Date
          </AppText>
          <View style={styles.dateRow}>
            <Pressable onPress={() => shiftDay(-1)} hitSlop={10}>
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </Pressable>
            <AppText variant="body" weight="semibold" style={{ color: colors.textPrimary }}>
              {date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </AppText>
            <Pressable onPress={() => shiftDay(1)} hitSlop={10}>
              <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption" style={styles.fieldLabel}>
            Note (optional)
          </AppText>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Add a note"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.noteInput,
              { color: colors.textPrimary, backgroundColor: colors.cardBackground, borderColor: colors.cardBorder, borderRadius: borderRadius.sm },
            ]}
          />
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
  segmented: {
    flexDirection: 'row',
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    marginLeft: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  noteInput: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
