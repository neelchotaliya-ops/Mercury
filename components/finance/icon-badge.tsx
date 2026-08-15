import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconName } from '@/types/finance';

export interface IconBadgeProps {
  icon: IconName;
  color: string;
  size?: number;
  style?: ViewStyle;
}

export const IconBadge: React.FC<IconBadgeProps> = ({ icon, color, size = 40, style }) => {
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${color}1F`,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
