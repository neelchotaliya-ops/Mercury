import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAppTheme } from '@/context/theme-context';

export interface IconButtonProps {
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  backgroundColor?: string;
  style?: ViewStyle;
}

export const IconButton: React.FC<IconButtonProps> = ({
  iconName,
  onPress,
  size = 44,
  iconSize = 20,
  color,
  backgroundColor,
  style,
}) => {
  const { colors } = useAppTheme();

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onPress();
  };

  const bg = backgroundColor || 'rgba(255, 255, 255, 0.75)';
  const iconColor = color || '#18181B'; // Crisp solid black icon

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          opacity: pressed ? 0.75 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
        style,
      ]}
    >
      <Ionicons name={iconName} size={iconSize} color={iconColor} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
});
