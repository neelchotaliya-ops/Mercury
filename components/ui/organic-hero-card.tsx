import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
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

import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/context/theme-context';
import { Gradients } from '@/constants/theme';

export interface HeroBadge {
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
}

export interface OrganicHeroCardProps {
  label?: string;
  value?: string;
  subLabel?: string;
  badges?: HeroBadge[];
  size?: number;
  children?: React.ReactNode;
}

const BADGE_SLOTS = ['topLeft', 'midLeft', 'bottomRight'] as const;

export const OrganicHeroCard: React.FC<OrganicHeroCardProps> = ({
  label,
  value,
  subLabel,
  badges = [],
  size = 220,
  children,
}) => {
  const { colorScheme, colors } = useAppTheme();
  const gradient = Gradients[colorScheme];

  const translateY = useSharedValue(0);
  const rotation = useSharedValue(0);
  const morph = useSharedValue(0);
  const badgeFloat1 = useSharedValue(0);
  const badgeFloat2 = useSharedValue(0);
  const badgeFloat3 = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 2800, easing: Easing.inOut(Easing.ease) }),
        withTiming(4, { duration: 2800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    rotation.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 3400, easing: Easing.inOut(Easing.ease) }),
        withTiming(-0.8, { duration: 3400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    morph.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 4200, easing: Easing.inOut(Easing.ease) })
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
    const topLeft = interpolate(morph.value, [0, 1], [size * 0.5, size * 0.42]);
    const topRight = interpolate(morph.value, [0, 1], [size * 0.42, size * 0.5]);
    const bottomRight = interpolate(morph.value, [0, 1], [size * 0.5, size * 0.42]);
    const bottomLeft = interpolate(morph.value, [0, 1], [size * 0.42, size * 0.5]);

    return {
      transform: [{ translateY: translateY.value }, { rotate: `${rotation.value}deg` }],
      borderTopLeftRadius: topLeft,
      borderTopRightRadius: topRight,
      borderBottomRightRadius: bottomRight,
      borderBottomLeftRadius: bottomLeft,
    };
  });

  const badgeStyle1 = useAnimatedStyle(() => ({ transform: [{ translateY: badgeFloat1.value }] }));
  const badgeStyle2 = useAnimatedStyle(() => ({ transform: [{ translateY: badgeFloat2.value }] }));
  const badgeStyle3 = useAnimatedStyle(() => ({ transform: [{ translateY: badgeFloat3.value }] }));
  const badgeStyles = [badgeStyle1, badgeStyle2, badgeStyle3];

  return (
    <View style={[styles.container, { width: size + 70, height: size + 70 }]}>
      <Animated.View style={[styles.card, { width: size, height: size, borderColor: colors.cardBorder }, cardAnimatedStyle]}>
        <LinearGradient colors={gradient.card as [string, string]} start={{ x: 0.1, y: 0.1 }} end={{ x: 0.9, y: 0.9 }} style={StyleSheet.absoluteFill} />
        {children ?? (
          <View style={styles.textContent}>
            {label ? <AppText variant="caption">{label}</AppText> : null}
            {value ? (
              <AppText variant="h1" style={{ color: colors.textPrimary }}>
                {value}
              </AppText>
            ) : null}
            {subLabel ? <AppText variant="body">{subLabel}</AppText> : null}
          </View>
        )}
      </Animated.View>

      {badges.slice(0, 3).map((badge, index) => (
        <Animated.View key={index} style={[styles.badge, styles[BADGE_SLOTS[index]], badgeStyles[index]]}>
          <View style={styles.badgeInner}>
            <Ionicons name={badge.icon} size={18} color={badge.color ?? colors.primary} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 10,
  },
  textContent: {
    alignItems: 'center',
    gap: 2,
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
  topLeft: {
    top: 12,
    left: 4,
  },
  midLeft: {
    top: '48%',
    left: -8,
  },
  bottomRight: {
    bottom: 20,
    right: 8,
  },
  badgeInner: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
});
