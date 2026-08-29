import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { IconBadge } from '@/components/finance/icon-badge';
import { useFinance } from '@/context/finance-context';
import { AccountType } from '@/types/finance';
import { ACCOUNT_TYPE_META, CATEGORY_COLOR_CHOICES } from '@/constants/categories';
import { CURRENCIES, getCurrencySymbol } from '@/utils/currency';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { getAccountDeletionImpact } from '@/db/entities';

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_META) as AccountType[];

export default function AddAccountScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { state, addAccount, updateAccount, deleteAccount } = useFinance();

  const editing = useMemo(
    () => state.accounts.find(a => a.id === params.id),
    [state.accounts, params.id]
  );

  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<AccountType>(editing?.type ?? 'cash');
  const [color, setColor] = useState(editing?.color ?? ACCOUNT_TYPE_META.cash.color);
  const [currency, setCurrency] = useState(editing?.currency ?? state.accounts[0]?.currency ?? state.settings.currency ?? 'INR');
  const [balance, setBalance] = useState(editing ? String(editing.initialBalance) : '');

  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      type,
      icon: ACCOUNT_TYPE_META[type].icon,
      color,
      initialBalance: parseFloat(balance || '0'),
      currency,
    };
    if (editing) updateAccount({ ...editing, ...payload });
    else addAccount(payload);
    router.back();
  };

  const handleDelete = async () => {
    if (!editing) return;

    const db = await getDb();
    const impact = await getAccountDeletionImpact(db, editing.id);

    const lines: string[] = ['Transactions on this account will also be removed.'];
    if (impact.recurringRuleCount > 0) {
      lines.push(
        `This also deletes ${impact.recurringRuleCount} recurring payment${impact.recurringRuleCount === 1 ? '' : 's'} tied to this account.`
      );
    }
    if (impact.budgetCount > 0) {
      lines.push(
        `${impact.budgetCount} budget${impact.budgetCount === 1 ? '' : 's'} scoped to this account will also be deleted.`
      );
    }
    if (impact.danglingPresetCount > 0) {
      lines.push(
        `${impact.danglingPresetCount} widget quick preset${impact.danglingPresetCount === 1 ? '' : 's'} pointing at this account will stop working.`
      );
    }

    Alert.alert('Delete account', lines.join(' '), [
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
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader
        title={editing ? 'Edit account' : 'New account'}
        onClose={() => router.back()}
        onDelete={editing ? handleDelete : undefined}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        <GlassCard strong style={styles.preview} elevated>
          <IconBadge icon={ACCOUNT_TYPE_META[type].icon} color={color} size={64} solid />
          <AppText variant="h3">{name.trim() || 'Account name'}</AppText>
          <AppText variant="caption">{`${ACCOUNT_TYPE_META[type].label} • ${getCurrencySymbol(currency)} ${currency}`}</AppText>
        </GlassCard>

        <GlassCard style={styles.formCard} padding={18}>
          <View style={styles.field}>
            <AppText variant="label">Name</AppText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Everyday savings"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <AppText variant="label">Currency</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.currencyRow}>
              {CURRENCIES.map(c => {
                const active = c.code === currency;
                return (
                  <Pressable
                    key={c.code}
                    onPress={() => setCurrency(c.code)}
                    style={[
                      styles.currencyChip,
                      {
                        backgroundColor: active ? Colors.ctaBg : Colors.controlBg,
                        borderColor: active ? 'transparent' : Colors.glassBorder,
                      },
                    ]}
                  >
                    <AppText variant="bodyStrong" color={active ? Colors.ctaText : Colors.primary}>
                      {c.symbol}
                    </AppText>
                    <AppText variant="micro" color={active ? Colors.ctaText : Colors.textPrimary}>
                      {c.code}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.field}>
            <AppText variant="label">Type</AppText>
            <View style={styles.typeRow}>
              {ACCOUNT_TYPES.map(t => {
                const active = t === type;
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
                        backgroundColor: active ? Colors.ctaBg : Colors.controlBg,
                        borderColor: active ? 'transparent' : Colors.glassBorder,
                      },
                    ]}
                  >
                    <Ionicons
                      name={meta.icon}
                      size={15}
                      color={active ? Colors.ctaText : Colors.textSecondary}
                    />
                    <AppText variant="micro" color={active ? Colors.ctaText : Colors.textPrimary}>
                      {meta.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <AppText variant="label">Colour</AppText>
            <View style={styles.colorRow}>
              {CATEGORY_COLOR_CHOICES.map(c => (
                <Pressable key={c} onPress={() => setColor(c)} style={styles.swatchSlot}>
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: c },
                      color === c && styles.swatchActive,
                    ]}
                  >
                    {color === c ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <AppText variant="label">Starting balance</AppText>
            <View style={styles.balanceRow}>
              <AppText variant="bodyStrong" color={Colors.textMuted}>
                {getCurrencySymbol(currency)}
              </AppText>
              <TextInput
                value={balance}
                onChangeText={t => setBalance(t.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={Colors.textMuted}
                style={styles.balanceInput}
              />
            </View>
          </View>
        </GlassCard>
      </ScrollView>

      <View style={styles.footer}>
        <AppButton
          title={editing ? 'Save changes' : 'Add account'}
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
    paddingBottom: 60,
    gap: Spacing.lg,
  },
  preview: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 26,
  },
  formCard: {
    gap: Spacing.xl,
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
  currencyRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  currencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatchSlot: {
    padding: 1,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#17131F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.04)',
  },
  balanceInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    color: Colors.textPrimary,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
});
