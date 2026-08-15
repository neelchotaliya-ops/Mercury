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
import { CategoryKind, Category } from '@/types/finance';
import { CATEGORY_ICON_CHOICES, CATEGORY_COLOR_CHOICES } from '@/constants/categories';

export default function ManageCategoriesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const { colors, borderRadius } = useAppTheme();
  const { state, addCategory, updateCategory, deleteCategory } = useFinance();

  const [kind, setKind] = useState<CategoryKind>(params.kind === 'income' ? 'income' : 'expense');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(CATEGORY_ICON_CHOICES[0]);
  const [color, setColor] = useState(CATEGORY_COLOR_CHOICES[0]);

  const categories = useMemo(() => state.categories.filter(c => c.kind === kind), [state.categories, kind]);

  const openNewForm = () => {
    setEditingCategory(null);
    setName('');
    setIcon(CATEGORY_ICON_CHOICES[0]);
    setColor(CATEGORY_COLOR_CHOICES[0]);
    setShowForm(true);
  };

  const openEditForm = (category: Category) => {
    setEditingCategory(category);
    setName(category.name);
    setIcon(category.icon);
    setColor(category.color);
    setShowForm(true);
  };

  const handleSave = () => {
    if (name.trim().length === 0) return;
    if (editingCategory) {
      updateCategory({ ...editingCategory, name: name.trim(), icon, color });
    } else {
      addCategory({ name: name.trim(), icon, color, kind });
    }
    setShowForm(false);
  };

  const handleDelete = () => {
    if (!editingCategory) return;
    Alert.alert('Delete category', 'Existing transactions will keep this category, but it will no longer be selectable.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteCategory(editingCategory.id);
          setShowForm(false);
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
          Categories
        </AppText>
        <View style={{ width: 22 }} />
      </View>

      <View style={[styles.segmented, { backgroundColor: colors.buttonSecondaryBg, borderRadius: borderRadius.pill }]}>
        {(['expense', 'income'] as CategoryKind[]).map(k => {
          const isActive = k === kind;
          return (
            <Pressable
              key={k}
              onPress={() => {
                setKind(k);
                setShowForm(false);
              }}
              style={[styles.segment, { borderRadius: borderRadius.pill, backgroundColor: isActive ? colors.cardBackground : 'transparent' }]}
            >
              <AppText variant="body" weight="semibold" style={{ color: colors.textPrimary, textTransform: 'capitalize' }}>
                {k}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          {categories.map(category => (
            <Pressable key={category.id} onPress={() => openEditForm(category)} style={styles.gridItem}>
              <IconBadge icon={category.icon} color={category.color} size={52} />
              <AppText variant="caption" align="center" numberOfLines={1} style={{ maxWidth: 68 }}>
                {category.name}
              </AppText>
            </Pressable>
          ))}
          <Pressable onPress={openNewForm} style={styles.gridItem}>
            <View style={[styles.addWrap, { borderColor: colors.border }]}>
              <Ionicons name="add" size={22} color={colors.textSecondary} />
            </View>
            <AppText variant="caption" align="center">
              Add new
            </AppText>
          </Pressable>
        </View>

        {showForm && (
          <View style={[styles.form, { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder, borderRadius: borderRadius.md }]}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Category name"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, borderRadius: borderRadius.sm }]}
            />

            <AppText variant="caption">Icon</AppText>
            <View style={styles.iconGrid}>
              {CATEGORY_ICON_CHOICES.map(i => (
                <Pressable
                  key={i}
                  onPress={() => setIcon(i)}
                  style={[styles.iconOption, { borderColor: icon === i ? color : 'transparent' }]}
                >
                  <IconBadge icon={i} color={color} size={40} />
                </Pressable>
              ))}
            </View>

            <AppText variant="caption">Color</AppText>
            <View style={styles.colorRow}>
              {CATEGORY_COLOR_CHOICES.map(c => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[styles.colorSwatch, { backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.textPrimary }]}
                />
              ))}
            </View>

            <View style={styles.formActions}>
              {editingCategory ? (
                <Pressable onPress={handleDelete} style={styles.deleteAction}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  <AppText variant="body" style={{ color: '#DC2626' }}>
                    Delete
                  </AppText>
                </Pressable>
              ) : (
                <View />
              )}
              <AppButton title="Save" onPress={handleSave} disabled={name.trim().length === 0} fullWidth={false} size="md" />
            </View>
          </View>
        )}
      </ScrollView>
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
  segmented: {
    flexDirection: 'row',
    marginHorizontal: 20,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  gridItem: {
    alignItems: 'center',
    gap: 6,
    width: 68,
  },
  addWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconOption: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 2,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  deleteAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
