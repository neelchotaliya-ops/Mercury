import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { IconBadge } from '@/components/finance/icon-badge';
import { useAppTheme } from '@/context/theme-context';
import { useFinance } from '@/context/finance-context';
import { AccountType } from '@/types/finance';
import { ACCOUNT_TYPE_META, CATEGORY_COLOR_CHOICES } from '@/constants/categories';
import { getCurrencySymbol } from '@/utils/currency';

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_META) as AccountType[];

export default function AddAccountScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { colors, spacing, borderRadius } = useAppTheme();
  const { state, addAccount, updateAccount, deleteAccount } = useFinance();

  const editing = useMemo(() => state.accounts.find(a => a.id === params.id), [state.accounts, params.id]);

  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<AccountType>(editing?.type ?? 'cash');
  const [color, setColor] = useState(editing?.color ?? ACCOUNT_TYPE_META['cash'].color);
  const [initialBalance, setInitialBalance] = useState(editing ? String(editing.initialBalance) : '');

  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const meta = ACCOUNT_TYPE_META[type];
    const payload = {
      name: name.trim(),
      type,
      icon: meta.icon,
      color,
      initialBalance: parseFloat(initialBalance || '0'),
    };

    if (editing) {
      updateAccount({ ...editing, ...payload });
    } else {
      addAccount(payload);
    }
    router.back();
  };

  const handleDelete = () => {
    if (!editing) return;
    Alert.alert('Delete account', 'Transactions on this account will also be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteAccount(editing.id);
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
          {editing ? 'Edit account' : 'Add account'}
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
        <View style={styles.previewRow}>
          <IconBadge icon={ACCOUNT_TYPE_META[type].icon} color={color} size={56} />
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption" style={styles.fieldLabel}>
            Name
          </AppText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. HDFC Savings"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              { color: colors.textPrimary, backgroundColor: colors.cardBackground, borderColor: colors.cardBorder, borderRadius: borderRadius.sm },
            ]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption" style={styles.fieldLabel}>
            Type
          </AppText>
          <View style={styles.typeRow}>
            {ACCOUNT_TYPES.map(t => {
              const isActive = t === type;
              const meta = ACCOUNT_TYPE_META[t];
              return (
                <Pressable
                  key={t}
                  onPress={() => {
                    setType(t);
                    if (!editing) setColor(meta.color);
                  }}
                  style={[
                    styles.typeChip,
                    {
                      borderRadius: borderRadius.pill,
                      backgroundColor: isActive ? colors.buttonPrimaryBg : colors.cardBackground,
                      borderColor: isActive ? colors.buttonPrimaryBg : colors.cardBorder,
                    },
                  ]}
                >
                  <AppText variant="body" weight="semibold" style={{ color: isActive ? '#FFFFFF' : colors.textPrimary }}>
                    {meta.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption" style={styles.fieldLabel}>
            Color
          </AppText>
          <View style={styles.colorRow}>
            {CATEGORY_COLOR_CHOICES.map(c => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.textPrimary },
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption" style={styles.fieldLabel}>
            {editing ? 'Initial balance' : 'Starting balance'}
          </AppText>
          <View
            style={[
              styles.balanceInputRow,
              { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder, borderRadius: borderRadius.sm },
            ]}
          >
            <AppText variant="body" weight="semibold" style={{ color: colors.textMuted }}>
              {getCurrencySymbol(state.settings.currency)}
            </AppText>
            <TextInput
              value={initialBalance}
              onChangeText={t => setInitialBalance(t.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textMuted}
              style={[styles.balanceInput, { color: colors.textPrimary }]}
            />
          </View>
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
  previewRow: {
    alignItems: 'center',
    marginVertical: 8,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    marginLeft: 4,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  balanceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  balanceInput: {
    flex: 1,
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
});
