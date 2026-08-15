import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { IconBadge } from '@/components/finance/icon-badge';
import { useAppTheme } from '@/context/theme-context';
import { Category } from '@/types/finance';

export interface CategoryPickerProps {
  categories: Category[];
  selectedId?: string;
  onSelect: (category: Category) => void;
  onManage?: () => void;
}

export const CategoryPicker: React.FC<CategoryPickerProps> = ({ categories, selectedId, onSelect, onManage }) => {
  const { colors } = useAppTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {categories.map(category => {
        const isSelected = category.id === selectedId;
        return (
          <Pressable key={category.id} onPress={() => onSelect(category)} style={styles.item}>
            <View
              style={[
                styles.iconWrap,
                {
                  borderWidth: isSelected ? 2 : 0,
                  borderColor: category.color,
                },
              ]}
            >
              <IconBadge icon={category.icon} color={category.color} size={52} />
            </View>
            <AppText
              variant="caption"
              align="center"
              style={{ color: isSelected ? colors.textPrimary : colors.textSecondary, maxWidth: 68 }}
              numberOfLines={1}
            >
              {category.name}
            </AppText>
          </Pressable>
        );
      })}
      {onManage ? (
        <Pressable onPress={onManage} style={styles.item}>
          <View style={[styles.iconWrap, styles.addWrap, { borderColor: colors.border }]}>
            <Ionicons name="add" size={22} color={colors.textSecondary} />
          </View>
          <AppText variant="caption" align="center" style={{ maxWidth: 68 }}>
            Manage
          </AppText>
        </Pressable>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  row: {
    gap: 14,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  item: {
    alignItems: 'center',
    gap: 6,
    width: 68,
  },
  iconWrap: {
    borderRadius: 30,
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
});
