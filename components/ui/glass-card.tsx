import React from 'react';
import { StyleSheet, ViewStyle, StyleProp, View, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Colors, Gradients, BorderRadius, Shadows, Spacing } from '@/constants/theme';
import { Duration, staggerDelay } from '@/constants/motion';

export interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  radius?: number;
  /** Brighter, more opaque fill for hero surfaces. */
  strong?: boolean;
  /** Blur strength; lower reads lighter and airier. */
  intensity?: number;
  /**
   * Stagger index for the entrance animation. Omit to render statically.
   * The delay is capped (see `staggerDelay`) so long lists do not turn into a
   * multi-second cascade of scheduled animations.
   */
  animateIndex?: number;
  elevated?: boolean;
}

const PADDING_KEYS = new Set([
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingHorizontal',
  'paddingVertical',
]);

const CONTENT_LAYOUT_KEYS = new Set([
  'flexDirection',
  'alignItems',
  'justifyContent',
  'gap',
  'rowGap',
  'columnGap',
  'flexWrap',
]);

function splitCardStyles(style: StyleProp<ViewStyle> | undefined, paddingProp: number | undefined) {
  const flattened = StyleSheet.flatten(style) || {};
  const containerStyle: ViewStyle = {};
  const contentStyle: ViewStyle = {};

  let hasPaddingInStyle = false;

  for (const [key, value] of Object.entries(flattened)) {
    if (PADDING_KEYS.has(key)) {
      hasPaddingInStyle = true;
      (contentStyle as any)[key] = value;
    } else if (CONTENT_LAYOUT_KEYS.has(key)) {
      (contentStyle as any)[key] = value;
    } else {
      (containerStyle as any)[key] = value;
    }
  }

  if (paddingProp !== undefined) {
    contentStyle.padding = paddingProp;
  } else if (!hasPaddingInStyle) {
    contentStyle.padding = Spacing.xl;
  }

  return { containerStyle, contentStyle };
}

const GlassCardBase: React.FC<GlassCardProps> = ({
  children,
  style,
  padding,
  radius,
  strong = false,
  intensity = 28,
  animateIndex,
  elevated = false,
}) => {
  const { containerStyle, contentStyle } = splitCardStyles(style, padding);

  const cardContainerStyle: ViewStyle = {
    borderRadius: radius ?? containerStyle.borderRadius ?? BorderRadius.lg,
    borderWidth: 1,
    borderColor: strong ? Colors.glassBorder : Colors.glassBorderSoft,
    backgroundColor: strong ? 'rgba(255, 255, 255, 0.75)' : 'rgba(255, 255, 255, 0.45)',
    overflow: 'hidden',
    ...(elevated ? Shadows.lifted : Shadows.soft),
    ...containerStyle,
  };

  return (
    <Animated.View
      entering={
        animateIndex !== undefined
          ? FadeInDown.delay(staggerDelay(animateIndex)).duration(Duration.base)
          : undefined
      }
      style={cardContainerStyle}
    >
      {Platform.OS !== 'android' && (
        <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFill} />
      )}
      <LinearGradient
        colors={(strong ? Gradients.glassStrong : Gradients.glass) as [string, string]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    width: '100%',
  },
});

/** Rendered once per row in long lists, so identity-stable props matter. */
export const GlassCard = React.memo(GlassCardBase);
