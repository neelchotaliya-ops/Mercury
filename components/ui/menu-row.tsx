import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';

export interface MenuRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  tint?: string;
  onPress: () => void;
  trailing?: React.ReactNode;
  divider?: boolean;
  disabled?: boolean;
}

/**
 * One tappable row in a `GlassCard padding={0}` list — icon in a tinted
 * circle, label, optional trailing content, optional bottom divider.
 * The shared shape behind Settings' and Manage's menus, so both read as one
 * consistent navigation-hub pattern rather than two near-identical
 * hand-rolled ones.
 */
export const MenuRow: React.FC<MenuRowProps> = ({
  icon,
  label,
  subtitle,
  tint,
  onPress,
  trailing,
  divider,
  disabled,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.row,
      divider && styles.rowDivider,
      { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
    ]}
  >
    <View style={[styles.rowIcon, { backgroundColor: `${tint ?? Colors.primary}1A` }]}>
      <Ionicons name={icon} size={16} color={tint ?? Colors.primary} />
    </View>
    <View style={styles.rowLabel}>
      <AppText variant="body" color={tint ?? Colors.textPrimary}>
        {label}
      </AppText>
      {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
    </View>
    {trailing ?? <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />}
  </Pressable>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    gap: 2,
  },
});
