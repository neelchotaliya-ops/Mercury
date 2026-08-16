import React from 'react';
import { Pressable, StyleSheet, ViewStyle, StyleProp, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { Colors, Shadows } from '@/constants/theme';
import { haptics } from '@/utils/haptics';

export interface IconButtonProps {
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  /** Solid dark treatment for primary actions. */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const IconButton: React.FC<IconButtonProps> = ({
  iconName,
  onPress,
  size = 44,
  iconSize,
  color,
  solid = false,
  style,
}) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const iconColor = color ?? (solid ? Colors.ctaText : Colors.textPrimary);

  const handlePress = () => {
    haptics.toggle();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.9, { damping: 14, stiffness: 340 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 11, stiffness: 240 });
      }}
      hitSlop={6}
    >
      <Animated.View
        style={[
          styles.button,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: solid ? Colors.ctaBg : Colors.controlBg,
            borderColor: solid ? 'transparent' : Colors.glassBorder,
          },
          solid ? Shadows.floating : Shadows.soft,
          animatedStyle,
          style,
        ]}
      >
        {!solid && Platform.OS !== 'android' && (
          <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
        )}
        <Ionicons name={iconName} size={iconSize ?? Math.round(size * 0.42)} color={iconColor} />
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
});
