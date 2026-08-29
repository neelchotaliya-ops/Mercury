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
import { Subcategory, IconName } from '@/types/finance';
import { CATEGORY_ICON_CHOICES, CATEGORY_COLOR_CHOICES } from '@/constants/categories';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';
import { getDb } from '@/db/client';
import { bumpDataVersion } from '@/db/version';
import {
  insertSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from '@/db/subcategories';
import { generateId } from '@/utils/id';
import { haptics } from '@/utils/haptics';

export default function ManageSubcategoriesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId: string }>();
  const { state } = useFinance();

  const parentCategory = useMemo(
    () => state.categories.find(c => c.id === params.categoryId),
    [state.categories, params.categoryId]
  );

  const subcategories = useMemo(
    () => (state.subcategories ?? []).filter(s => s.categoryId === params.categoryId),
    [state.subcategories, params.categoryId]
  );

  const [editingSubcat, setEditingSubcat] = useState<Subcategory | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<IconName>(CATEGORY_ICON_CHOICES[0]);
  const [color, setColor] = useState(parentCategory?.color ?? CATEGORY_COLOR_CHOICES[0]);

  const openNew = () => {
    setEditingSubcat(null);
    setName('');
    setIcon(parentCategory?.icon ?? CATEGORY_ICON_CHOICES[0]);
    setColor(parentCategory?.color ?? CATEGORY_COLOR_CHOICES[0]);
    setShowForm(true);
  };

  const openEdit = (subcat: Subcategory) => {
    setEditingSubcat(subcat);
    setName(subcat.name);
    setIcon(subcat.icon);
    setColor(subcat.color);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !params.categoryId) return;
    try {
      const db = await getDb();
      if (editingSubcat) {
        await updateSubcategory(db, {
          ...editingSubcat,
          name: name.trim(),
          icon,
          color,
        });
      } else {
        const newSubcat: Subcategory = {
          id: generateId(),
          categoryId: params.categoryId,
          name: name.trim(),
          icon,
          color,
          isDefault: false,
        };
        await insertSubcategory(db, newSubcat, subcategories.length);
      }
      bumpDataVersion();
      haptics.success();
      setShowForm(false);
    } catch {
      Alert.alert('Error', 'Failed to save subcategory.');
    }
  };

  const handleDelete = () => {
    if (!editingSubcat) return;
    Alert.alert(
      'Delete subcategory',
      'Transactions with this subcategory will keep the parent category, but the subcategory tag will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const db = await getDb();
              await deleteSubcategory(db, editingSubcat.id);
              bumpDataVersion();
              haptics.success();
              setShowForm(false);
            } catch {
              Alert.alert('Error', 'Failed to delete subcategory.');
            }
          },
        },
      ]
    );
  };

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader
        title={parentCategory ? `${parentCategory.name} Subcategories` : 'Subcategories'}
        onClose={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        {parentCategory && (
          <GlassCard padding={14} style={styles.parentCard}>
            <IconBadge icon={parentCategory.icon} color={parentCategory.color} size={40} />
            <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
              <AppText variant="caption" color={Colors.textSecondary}>Parent Category</AppText>
              <AppText variant="bodyStrong" numberOfLines={1}>{parentCategory.name}</AppText>
            </View>
            <AppButton title="+ Add" size="sm" variant="glass" fullWidth={false} onPress={openNew} />
          </GlassCard>
        )}

        <GlassCard padding={18}>
          <View style={styles.headerRow}>
            <AppText variant="h3">Existing Subcategories</AppText>
            <AppText variant="caption" color={Colors.textSecondary}>
              {subcategories.length} {subcategories.length === 1 ? 'item' : 'items'}
            </AppText>
          </View>

          {subcategories.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="pricetags-outline" size={36} color={Colors.textMuted} />
              <AppText variant="body" color={Colors.textSecondary} style={{ marginTop: 8 }}>
                No subcategories yet
              </AppText>
              <AppText variant="caption" color={Colors.textMuted} style={{ marginTop: 4, textAlign: 'center' }}>
                Subcategories let you add extra detail (e.g. Netflix, Spotify) under {parentCategory?.name ?? 'this category'}.
              </AppText>
              <AppButton title="Create first subcategory" size="sm" onPress={openNew} style={{ marginTop: 14 }} />
            </View>
          ) : (
            <View style={styles.list}>
              {subcategories.map(sub => {
                const active = editingSubcat?.id === sub.id && showForm;
                return (
                  <Pressable
                    key={sub.id}
                    onPress={() => openEdit(sub)}
                    style={({ pressed }) => [
                      styles.listItem,
                      active && styles.listItemActive,
                      { opacity: pressed ? 0.75 : 1 },
                    ]}
                  >
                    <IconBadge icon={sub.icon} color={sub.color} size={32} />
                    <AppText variant="body" style={{ flex: 1, marginLeft: 12 }}>
                      {sub.name}
                    </AppText>
                    <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </GlassCard>

        {showForm && (
          <GlassCard padding={18} style={styles.formCard}>
            <View style={styles.formHeader}>
              <AppText variant="h3">
                {editingSubcat ? 'Edit Subcategory' : 'New Subcategory'}
              </AppText>
              {editingSubcat && (
                <Pressable onPress={handleDelete} hitSlop={10}>
                  <Ionicons name="trash-outline" size={20} color={Colors.expense} />
                </Pressable>
              )}
            </View>

            <View style={styles.field}>
              <AppText variant="label">Name</AppText>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Netflix, Electricity, Dining Out"
                placeholderTextColor={Colors.textMuted}
                autoFocus
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <AppText variant="label">Icon</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                {CATEGORY_ICON_CHOICES.map(i => {
                  const isSelected = icon === i;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => {
                        haptics.selection();
                        setIcon(i);
                      }}
                      style={[
                        styles.iconChoice,
                        isSelected && { backgroundColor: Colors.primarySoft, borderColor: Colors.primary },
                      ]}
                    >
                      <Ionicons
                        name={i}
                        size={18}
                        color={isSelected ? Colors.primaryDeep : Colors.textPrimary}
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.field}>
              <AppText variant="label">Color</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                {CATEGORY_COLOR_CHOICES.map(c => {
                  const isSelected = color === c;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => {
                        haptics.selection();
                        setColor(c);
                      }}
                      style={[
                        styles.colorChoice,
                        { backgroundColor: c },
                        isSelected && styles.colorChoiceSelected,
                      ]}
                    />
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.formActions}>
              <AppButton
                title="Cancel"
                variant="glass"
                size="md"
                onPress={() => setShowForm(false)}
                style={{ flex: 1 }}
              />
              <AppButton
                title={editingSubcat ? 'Update' : 'Save'}
                size="md"
                onPress={handleSave}
                disabled={!name.trim()}
                style={{ flex: 1 }}
              />
            </View>
          </GlassCard>
        )}
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 80,
    gap: Spacing.md,
  },
  parentCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  list: {
    gap: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(25, 21, 39, 0.03)',
  },
  listItemActive: {
    backgroundColor: Colors.primarySoft,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  formCard: {
    gap: Spacing.md,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  field: {
    gap: 8,
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
  choiceRow: {
    gap: 8,
    paddingVertical: 4,
  },
  iconChoice: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.controlBg,
    borderWidth: 1,
    borderColor: Colors.glassBorderSoft,
  },
  colorChoice: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  colorChoiceSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.15 }],
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
});
