import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { Colors, Gradients, BorderRadius } from '@/constants/theme';
import { TopographicField } from '@/components/ui/topographic-field';

export interface GradientScreenProps {
  children: React.ReactNode;
  /** Decorative contour field behind the content. */
  contours?: 'none' | 'top' | 'full';
  edges?: readonly Edge[];
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Three slow-drifting ambient orbs that give the app a "living" quality.
 * Very subtle — 6–8% opacity, 8–14s full cycles, ±25–35dp travel.
 * Skipped entirely when the OS reduce-motion preference is on.
 */
function AmbientOrbs() {
  const x1 = useSharedValue(0);
  const y1 = useSharedValue(0);
  const x2 = useSharedValue(0);
  const y2 = useSharedValue(0);
  const x3 = useSharedValue(0);
  const y3 = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (reduce || cancelled) return;

      const ease = Easing.inOut(Easing.sin);

      // Orb 1 — drifts top-left to bottom-right, 10s
      x1.value = withRepeat(
        withSequence(withTiming(28, { duration: 10000, easing: ease }), withTiming(0, { duration: 10000, easing: ease })),
        -1,
        false
      );
      y1.value = withRepeat(
        withSequence(withTiming(22, { duration: 10000, easing: ease }), withTiming(0, { duration: 10000, easing: ease })),
        -1,
        false
      );

      // Orb 2 — drifts right, slightly offset phase (start at 5s into cycle), 12s
      x2.value = withRepeat(
        withSequence(withTiming(-25, { duration: 12000, easing: ease }), withTiming(0, { duration: 12000, easing: ease })),
        -1,
        false
      );
      y2.value = withRepeat(
        withSequence(withTiming(30, { duration: 14000, easing: ease }), withTiming(0, { duration: 14000, easing: ease })),
        -1,
        false
      );

      // Orb 3 — subtler, near center, 8s
      x3.value = withRepeat(
        withSequence(withTiming(18, { duration: 8000, easing: ease }), withTiming(-12, { duration: 8000, easing: ease })),
        -1,
        false
      );
      y3.value = withRepeat(
        withSequence(withTiming(-20, { duration: 9000, easing: ease }), withTiming(10, { duration: 9000, easing: ease })),
        -1,
        false
      );
    });
    return () => { cancelled = true; };
  }, [x1, y1, x2, y2, x3, y3]);

  const orb1Style = useAnimatedStyle(() => ({
    transform: [{ translateX: x1.value }, { translateY: y1.value }],
  }));
  const orb2Style = useAnimatedStyle(() => ({
    transform: [{ translateX: x2.value }, { translateY: y2.value }],
  }));
  const orb3Style = useAnimatedStyle(() => ({
    transform: [{ translateX: x3.value }, { translateY: y3.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Top-left warm orb */}
      <Animated.View style={[styles.orb, styles.orb1, orb1Style]} />
      {/* Bottom-right cool orb */}
      <Animated.View style={[styles.orb, styles.orb2, orb2Style]} />
      {/* Center accent orb */}
      <Animated.View style={[styles.orb, styles.orb3, orb3Style]} />
    </View>
  );
}

export const GradientScreen: React.FC<GradientScreenProps> = ({
  children,
  contours = 'none',
  edges = ['top'],
  contentStyle,
}) => {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Gradients.screen.colors as [string, string, string, string]}
        locations={Gradients.screen.locations as [number, number, number, number]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <AmbientOrbs />

      {contours !== 'none' && <TopographicField warm={contours === 'full'} />}

      <SafeAreaView style={[styles.content, contentStyle]} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
  orb: {
    position: 'absolute',
    borderRadius: BorderRadius.pill,
  },
  // Warm blush — top-left area
  orb1: {
    width: 340,
    height: 340,
    top: -80,
    left: -100,
    backgroundColor: 'rgba(236, 138, 184, 0.07)',
  },
  // Cool lavender — bottom-right area
  orb2: {
    width: 400,
    height: 400,
    bottom: -120,
    right: -140,
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
  },
  // Soft peach — mid-screen accent
  orb3: {
    width: 260,
    height: 260,
    top: '35%',
    left: '20%',
    backgroundColor: 'rgba(253, 186, 116, 0.05)',
  },
});

