import React from 'react';
import { StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Colors, Gradients, BorderRadius, Shadows, Spacing } from '@/constants/theme';

export interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  radius?: number;
  /** Brighter, more opaque fill for hero surfaces. */
  strong?: boolean;
  /** Blur strength; lower reads lighter and airier. */
  intensity?: number;
  /** Stagger index for the entrance animation. Omit to render statically. */
  animateIndex?: number;
  elevated?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  padding,
  radius,
  strong = false,
  intensity = 28,
  animateIndex,
  elevated = false,
}) => {
  const containerStyle: ViewStyle = {
    borderRadius: radius ?? BorderRadius.lg,
    padding: padding ?? Spacing.xl,
    borderWidth: 1,
    borderColor: strong ? Colors.glassBorder : Colors.glassBorderSoft,
    overflow: 'hidden',
    ...(elevated ? Shadows.lifted : Shadows.soft),
  };

  return (
    <Animated.View
      entering={
        animateIndex !== undefined
          ? FadeInDown.delay(animateIndex * 70)
              .duration(420)
              .springify()
              .damping(18)
          : undefined
      }
      style={[containerStyle, style]}
    >
      <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={(strong ? Gradients.glassStrong : Gradients.glass) as [string, string]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </Animated.View>
  );
};
