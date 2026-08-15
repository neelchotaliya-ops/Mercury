import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useAppTheme } from '@/context/theme-context';
import { Gradients } from '@/constants/theme';

export interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  padding?: number;
  radius?: number;
  animateIndex?: number;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, style, padding, radius, animateIndex }) => {
  const { colorScheme, colors, spacing, borderRadius, shadows } = useAppTheme();
  const gradient = Gradients[colorScheme];

  const containerStyle: ViewStyle = {
    borderRadius: radius ?? borderRadius.lg,
    padding: padding ?? spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
    ...shadows.md,
  };

  const content = (
    <Animated.View
      entering={animateIndex !== undefined ? FadeInDown.delay(animateIndex * 60).springify().damping(16) : undefined}
      style={[containerStyle, style]}
    >
      <LinearGradient
        colors={gradient.card as [string, string]}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 0.9 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </Animated.View>
  );

  return content;
};
