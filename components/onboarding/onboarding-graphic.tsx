import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const CARD_SIZE = 260;

export interface OnboardingGraphicProps {
  stepIndex: number; // 0 for Step 1, 1 for Step 2, 2 for Step 3
}

export const OnboardingGraphic: React.FC<OnboardingGraphicProps> = ({ stepIndex }) => {
  // Shared floating & morphing values
  const translateY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const morph = useSharedValue(0);

  // Floating badges values
  const badgeFloat1 = useSharedValue(0);
  const badgeFloat2 = useSharedValue(0);
  const badgeFloat3 = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
        withTiming(4, { duration: 2800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    rotation.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 3400, easing: Easing.inOut(Easing.ease) }),
        withTiming(-1.2, { duration: 3400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    morph.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 4000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    badgeFloat1.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 2400, easing: Easing.inOut(Easing.ease) }),
        withTiming(3, { duration: 2400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    badgeFloat2.value = withRepeat(
      withSequence(
        withTiming(6, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
        withTiming(-3, { duration: 2800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    badgeFloat3.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
        withTiming(4, { duration: 2600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const cardAnimatedStyle = useAnimatedStyle(() => {
    const topLeft = interpolate(morph.value, [0, 1], [130, 110]);
    const topRight = interpolate(morph.value, [0, 1], [110, 130]);
    const bottomRight = interpolate(morph.value, [0, 1], [130, 110]);
    const bottomLeft = interpolate(morph.value, [0, 1], [110, 130]);

    return {
      transform: [
        { translateY: translateY.value },
        { rotate: `${rotation.value}deg` },
      ],
      borderTopLeftRadius: topLeft,
      borderTopRightRadius: topRight,
      borderBottomRightRadius: bottomRight,
      borderBottomLeftRadius: bottomLeft,
    };
  });

  const animatedBadge1 = useAnimatedStyle(() => ({
    transform: [{ translateY: badgeFloat1.value }],
  }));
  const animatedBadge2 = useAnimatedStyle(() => ({
    transform: [{ translateY: badgeFloat2.value }],
  }));
  const animatedBadge3 = useAnimatedStyle(() => ({
    transform: [{ translateY: badgeFloat3.value }],
  }));

  // Render Step 1 Illustration: Document Scan Frame
  const renderStep1Content = () => (
    <Svg height={CARD_SIZE} width={CARD_SIZE} viewBox="0 0 260 260">
      {/* Top Left Bracket */}
      <Path d="M 90 95 L 80 95 C 74 95, 70 99, 70 105 L 70 115" fill="none" stroke="#8B5CF6" strokeWidth="4" strokeLinecap="round" />
      {/* Top Right Bracket */}
      <Path d="M 170 95 L 180 95 C 186 95, 190 99, 190 105 L 190 115" fill="none" stroke="#8B5CF6" strokeWidth="4" strokeLinecap="round" />
      {/* Bottom Left Bracket */}
      <Path d="M 70 145 L 70 155 C 70 161, 74 165, 80 165 L 90 165" fill="none" stroke="#8B5CF6" strokeWidth="4" strokeLinecap="round" />
      {/* Bottom Right Bracket */}
      <Path d="M 190 145 L 190 155 C 190 161, 186 165, 180 165 L 170 165" fill="none" stroke="#8B5CF6" strokeWidth="4" strokeLinecap="round" />

      {/* Center Document Lines Icon */}
      <Rect x="100" y="105" width="60" height="50" rx="8" fill="none" stroke="#8B5CF6" strokeWidth="3" />
      <Path d="M 115 120 L 145 120" stroke="#8B5CF6" strokeWidth="3.5" strokeLinecap="round" />
      <Path d="M 115 130 L 145 130" stroke="#8B5CF6" strokeWidth="3.5" strokeLinecap="round" />
      <Path d="M 115 140 L 135 140" stroke="#8B5CF6" strokeWidth="3.5" strokeLinecap="round" />
    </Svg>
  );

  // Render Step 2 Illustration: Privacy Shield Lock
  const renderStep2Content = () => (
    <Svg height={CARD_SIZE} width={CARD_SIZE} viewBox="0 0 260 260">
      {/* Outer Shield Frame */}
      <Path
        d="M 130 75 C 155 75, 175 80, 175 80 C 175 80, 180 130, 130 185 C 80 130, 85 80, 85 80 C 85 80, 105 75, 130 75 Z"
        fill="none"
        stroke="#8B5CF6"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      {/* Lock Body inside Shield */}
      <Rect x="112" y="122" width="36" height="28" rx="6" fill="none" stroke="#8B5CF6" strokeWidth="3.5" />
      {/* Lock Shackle */}
      <Path d="M 120 122 L 120 112 C 120 106, 124 102, 130 102 C 136 102, 140 106, 140 112 L 140 122" fill="none" stroke="#8B5CF6" strokeWidth="3.5" strokeLinecap="round" />
      {/* Lock Keyhole Dot */}
      <Circle cx="130" cy="134" r="3" fill="#8B5CF6" />
      <Path d="M 130 136 L 130 143" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  );

  // Render Step 3 Illustration: Dual Trend Curves (Solid + Dashed)
  const renderStep3Content = () => (
    <Svg height={CARD_SIZE} width={CARD_SIZE} viewBox="0 0 260 260">
      <Defs>
        <SvgLinearGradient id="waveArea" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.18" />
          <Stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.0" />
        </SvgLinearGradient>
      </Defs>

      {/* Shaded Area under Solid Wave */}
      <Path
        d="M 45 160 C 85 200, 135 70, 185 80 C 200 82, 210 120, 215 150 L 215 210 L 45 210 Z"
        fill="url(#waveArea)"
      />

      {/* Dashed Secondary Wave */}
      <Path
        d="M 45 160 C 95 120, 145 190, 215 150"
        fill="none"
        stroke="#A78BFA"
        strokeWidth="3.5"
        strokeDasharray="6 6"
        strokeLinecap="round"
      />

      {/* Main Solid Purple Wave */}
      <Path
        d="M 45 165 C 95 210, 135 70, 185 80 C 205 84, 212 110, 215 150"
        fill="none"
        stroke="#8B5CF6"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </Svg>
  );

  return (
    <View style={styles.container}>
      {/* Central Squircle Glass Card */}
      <Animated.View style={[styles.organicGlassCard, cardAnimatedStyle]}>
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.98)', 'rgba(255, 248, 250, 0.85)']}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={StyleSheet.absoluteFill}
        />

        {stepIndex === 0 && renderStep1Content()}
        {stepIndex === 1 && renderStep2Content()}
        {stepIndex === 2 && renderStep3Content()}
      </Animated.View>

      {/* Floating Badges for Step 1 */}
      {stepIndex === 0 && (
        <>
          <Animated.View style={[styles.badge, styles.badgeTopLeft, animatedBadge1]}>
            <View style={styles.badgeInner}>
              <Ionicons name="receipt-outline" size={20} color="#8B5CF6" />
            </View>
          </Animated.View>
          <Animated.View style={[styles.badge, styles.badgeMidLeft, animatedBadge2]}>
            <View style={styles.badgeInnerSmall}>
              <Ionicons name="checkmark" size={14} color="#8B5CF6" />
            </View>
          </Animated.View>
          <Animated.View style={[styles.badge, styles.badgeBottomRight, animatedBadge3]}>
            <View style={styles.badgeInner}>
              <Ionicons name="sync-outline" size={18} color="#18181B" />
            </View>
          </Animated.View>
        </>
      )}

      {/* Floating Badges for Step 2 */}
      {stepIndex === 1 && (
        <>
          <Animated.View style={[styles.badge, styles.badgeTopLeft, animatedBadge1]}>
            <View style={styles.badgeInner}>
              <Ionicons name="key-outline" size={18} color="#8B5CF6" />
            </View>
          </Animated.View>
          <Animated.View style={[styles.badge, styles.badgeMidLeft, animatedBadge2]}>
            <View style={styles.badgeInnerDot}>
              <View style={styles.dotCenter} />
            </View>
          </Animated.View>
          <Animated.View style={[styles.badge, styles.badgeBottomRight, animatedBadge3]}>
            <View style={styles.badgeInner}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#18181B" />
            </View>
          </Animated.View>
        </>
      )}

      {/* Floating Badges for Step 3 */}
      {stepIndex === 2 && (
        <>
          <Animated.View style={[styles.badge, styles.badgeTopLeft, animatedBadge1]}>
            <View style={styles.badgeInner}>
              <Ionicons name="stats-chart" size={19} color="#8B5CF6" />
            </View>
          </Animated.View>
          <Animated.View style={[styles.badge, styles.badgeBottomRight, animatedBadge3]}>
            <View style={styles.badgeInner}>
              <Ionicons name="pie-chart" size={19} color="#8B5CF6" />
            </View>
          </Animated.View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: CARD_SIZE + 60,
    height: CARD_SIZE + 60,
    marginVertical: 10,
  },
  organicGlassCard: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 10,
  },
  badge: {
    position: 'absolute',
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 5,
  },
  badgeTopLeft: {
    top: 25,
    left: 15,
  },
  badgeMidLeft: {
    top: 130,
    left: 8,
  },
  badgeBottomRight: {
    bottom: 35,
    right: 20,
  },
  badgeInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  badgeInnerSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  badgeInnerDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCenter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8B5CF6',
  },
});
