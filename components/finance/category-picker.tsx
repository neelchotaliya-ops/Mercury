import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { IconBadge } from '@/components/finance/icon-badge';
import { Category } from '@/types/finance';
import { Colors } from '@/constants/theme';

export interface CategoryPickerProps {
  categories: Category[];
  selectedId?: string;
  onSelect: (category: Category) => void;
  onManage?: () => void;
}

export const CategoryPicker: React.FC<CategoryPickerProps> = ({
  categories,
  selectedId,
  onSelect,
  onManage,
}) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
    {categories.map(category => {
      const selected = category.id === selectedId;
      return (
        <Pressable
          key={category.id}
          onPress={() => onSelect(category)}
          style={({ pressed }) => [styles.item, { opacity: pressed ? 0.7 : 1 }]}
        >
          <IconBadge
            icon={category.icon}
            color={category.color}
            size={52}
            solid={selected}
            style={selected ? styles.selectedBadge : undefined}
          />
          <AppText
            variant="micro"
            align="center"
            numberOfLines={1}
            color={selected ? Colors.textPrimary : Colors.textMuted}
          >
            {category.name}
          </AppText>
        </Pressable>
      );
    })}

    {onManage ? (
      <Pressable onPress={onManage} style={({ pressed }) => [styles.item, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={styles.addTile}>
          <Ionicons name="add" size={21} color={Colors.textSecondary} />
        </View>
        <AppText variant="micro" align="center">
          Manage
        </AppText>
      </Pressable>
    ) : null}
  </ScrollView>
);

const styles = StyleSheet.create({
  row: {
    gap: 14,
    paddingVertical: 4,
    paddingRight: 8,
  },
  item: {
    alignItems: 'center',
    gap: 7,
    width: 64,
  },
  selectedBadge: {
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 5,
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
});
