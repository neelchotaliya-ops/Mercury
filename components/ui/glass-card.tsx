import React from 'react';
import { StyleSheet, ViewStyle, StyleProp, View, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated from 'react-native-reanimated';

import { Colors, Gradients, BorderRadius, Shadows, Spacing } from '@/constants/theme';
import { staggerDelay } from '@/constants/motion';
import { useMountPop } from '@/hooks/use-mount-pop';

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
   * Stagger index for list rows: each successive card enters slightly after
   * the previous one. The delay is capped (see `staggerDelay`) so long lists
   * do not turn into a multi-second cascade of scheduled animations. Omit for
   * a single card (e.g. a page's one hero card), which still animates, just
   * with no added delay.
   */
  animateIndex?: number;
  elevated?: boolean;
  /**
   * Every card animates in by default — that consistency is the point. Set
   * `false` only for a card that must appear instantly, e.g. one swapped in
   * as the result of the user's own tap (a selected state), where a second
   * entrance animation would read as lag rather than arrival.
   */
  animate?: boolean;
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
  } else {
    if (
      contentStyle.padding === undefined &&
      contentStyle.paddingHorizontal === undefined &&
      contentStyle.paddingLeft === undefined &&
      contentStyle.paddingRight === undefined
    ) {
      contentStyle.paddingHorizontal = Spacing.lg;
    }
    if (
      contentStyle.padding === undefined &&
      contentStyle.paddingVertical === undefined &&
      contentStyle.paddingTop === undefined &&
      contentStyle.paddingBottom === undefined
    ) {
      contentStyle.paddingVertical = Spacing.lg;
    }
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
  animate = true,
}) => {
  const { containerStyle, contentStyle } = splitCardStyles(style, padding);
  const mountStyle = useMountPop(animateIndex !== undefined ? staggerDelay(animateIndex) : 0, animate);

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
    <Animated.View style={[cardContainerStyle, mountStyle]}>
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
