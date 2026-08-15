import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { IconName } from '@/types/finance';

export interface IconBadgeProps {
  icon: IconName;
  color: string;
  size?: number;
  /** Filled treatment uses the colour as the background. */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Soft rounded-square icon tile — the app's standard category/account mark. */
export const IconBadge: React.FC<IconBadgeProps> = ({ icon, color, size = 44, solid = false, style }) => (
  <View
    style={[
      styles.badge,
      {
        width: size,
        height: size,
        borderRadius: size * 0.34,
        backgroundColor: solid ? color : `${color}22`,
        borderColor: solid ? 'transparent' : `${color}2E`,
      },
      style,
    ]}
  >
    <Ionicons name={icon} size={size * 0.46} color={solid ? '#FFFFFF' : color} />
  </View>
);

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
