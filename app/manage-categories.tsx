import React, { useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { GradientScreen } from '@/components/ui/gradient-screen';
import { GlassCard } from '@/components/ui/glass-card';
import { ModalHeader } from '@/components/ui/modal-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { IconBadge } from '@/components/finance/icon-badge';
import { useFinance } from '@/context/finance-context';
import { CategoryKind, Category } from '@/types/finance';
import { CATEGORY_ICON_CHOICES, CATEGORY_COLOR_CHOICES } from '@/constants/categories';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

export default function ManageCategoriesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const { state, addCategory, updateCategory, deleteCategory } = useFinance();

  const [kind, setKind] = useState<CategoryKind>(params.kind === 'income' ? 'income' : 'expense');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(CATEGORY_ICON_CHOICES[0]);
  const [color, setColor] = useState(CATEGORY_COLOR_CHOICES[0]);

  const categories = useMemo(
    () => state.categories.filter(c => c.kind === kind),
    [state.categories, kind]
  );

  const openNew = () => {
    setEditingCategory(null);
    setName('');
    setIcon(CATEGORY_ICON_CHOICES[0]);
    setColor(CATEGORY_COLOR_CHOICES[0]);
    setShowForm(true);
  };

  const openEdit = (category: Category) => {
    setEditingCategory(category);
    setName(category.name);
    setIcon(category.icon);
    setColor(category.color);
    setShowForm(true);
  };

  const handleSave = () => {
    if (name.trim().length === 0) return;
    if (editingCategory) updateCategory({ ...editingCategory, name: name.trim(), icon, color });
    else addCategory({ name: name.trim(), icon, color, kind });
    setShowForm(false);
  };

  const handleDelete = () => {
    if (!editingCategory) return;
    Alert.alert(
      'Delete category',
      'Existing transactions keep this category, but it will no longer be selectable.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteCategory(editingCategory.id);
            setShowForm(false);
          },
        },
      ]
    );
  };

  return (
    <GradientScreen edges={['top', 'bottom']} contours="top">
      <ModalHeader title="Categories" onClose={() => router.back()} />

      <View style={styles.switchWrap}>
        <SegmentedControl<CategoryKind>
          options={[
            { key: 'expense', label: 'Spending' },
            { key: 'income', label: 'Income' },
          ]}
          value={kind}
          onChange={next => {
            setKind(next);
            setShowForm(false);
          }}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <GlassCard padding={18}>
          <View style={styles.grid}>
            {categories.map(category => {
              const active = editingCategory?.id === category.id && showForm;
              return (
                <Pressable
                  key={category.id}
                  onPress={() => openEdit(category)}
                  style={({ pressed }) => [styles.gridItem, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <IconBadge icon={category.icon} color={category.color} size={52} solid={active} />
                  <AppText variant="micro" align="center" numberOfLines={1}>
                    {category.name}
                  </AppText>
                </Pressable>
              );
            })}

            <Pressable onPress={openNew} style={({ pressed }) => [styles.gridItem, { opacity: pressed ? 0.7 : 1 }]}>
              <View style={styles.addTile}>
                <Ionicons name="add" size={21} color={Colors.textSecondary} />
              </View>
              <AppText variant="micro" align="center">
                New
              </AppText>
            </Pressable>
          </View>
        </GlassCard>

        {showForm && (
          <GlassCard strong style={styles.form} padding={18} elevated>
            <View style={styles.formHeader}>
              <IconBadge icon={icon} color={color} size={46} solid />
              <AppText variant="h3">{editingCategory ? 'Edit category' : 'New category'}</AppText>
            </View>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Category name"
              placeholderTextColor={Colors.textMuted}
              style={styles.input}
            />

            <View style={styles.field}>
              <AppText variant="label">Icon</AppText>
              <View style={styles.iconGrid}>
                {CATEGORY_ICON_CHOICES.map(i => (
                  <Pressable key={i} onPress={() => setIcon(i)}>
                    <IconBadge icon={i} color={color} size={40} solid={icon === i} />
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <AppText variant="label">Colour</AppText>
              <View style={styles.colorRow}>
                {CATEGORY_COLOR_CHOICES.map(c => (
                  <Pressable key={c} onPress={() => setColor(c)}>
                    <View style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}>
                      {color === c ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formActions}>
              {editingCategory ? (
                <AppButton
                  title="Delete"
                  onPress={handleDelete}
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                  textStyle={{ color: Colors.expense }}
                />
              ) : (
                <AppButton
                  title="Cancel"
                  onPress={() => setShowForm(false)}
                  variant="ghost"
                  size="sm"
                  fullWidth={false}
                />
              )}
              <AppButton
                title="Save"
                onPress={handleSave}
                disabled={name.trim().length === 0}
                size="sm"
                fullWidth={false}
                style={styles.saveButton}
              />
            </View>
          </GlassCard>
        )}
      </ScrollView>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  switchWrap: {
    paddingHorizontal: 20,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: Spacing.lg,
    paddingBottom: 40,
    gap: Spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  gridItem: {
    alignItems: 'center',
    gap: 7,
    width: 64,
  },
  addTile: {
    width: 52,
    height: 52,
    borderRadius: 52 * 0.34,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    gap: Spacing.lg,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  field: {
    gap: 10,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
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
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  saveButton: {
    minWidth: 120,
  },
});
