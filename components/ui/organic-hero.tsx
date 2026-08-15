import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Path,
  Ellipse,
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient as SvgRadialGradient,
  Stop,
} from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';
import { BLOB_PATH, BLOB_VIEWBOX } from '@/constants/shapes';

export type BadgeSlot = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export interface HeroBadge {
  icon: keyof typeof Ionicons.glyphMap;
  slot: BadgeSlot;
  color?: string;
  label?: string;
}

export interface OrganicHeroProps {
  label?: string;
  value?: string;
  sub?: string;
  badges?: HeroBadge[];
  size?: number;
  children?: React.ReactNode;
}

/** Positioned to sit on the blob's edge, so badges read as attached to it. */
const SLOT_STYLES: Record<BadgeSlot, ViewStyle> = {
  topLeft: { top: '20%', left: '5%' },
  topRight: { top: '9%', right: '5%' },
  bottomLeft: { bottom: '24%', left: '4%' },
  bottomRight: { bottom: '14%', right: '6%' },
};

export const OrganicHero: React.FC<OrganicHeroProps> = ({
  label,
  value,
  sub,
  badges = [],
  size = 250,
  children,
}) => {
  const float = useSharedValue(0);
  const tilt = useSharedValue(0);
  const badgeA = useSharedValue(0);
  const badgeB = useSharedValue(0);

  useEffect(() => {
    float.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: 3200, easing: Easing.inOut(Easing.ease) }),
        withTiming(5, { duration: 3200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    tilt.value = withRepeat(
      withSequence(
        withTiming(1.4, { duration: 4200, easing: Easing.inOut(Easing.ease) }),
        withTiming(-1.4, { duration: 4200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    badgeA.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
        withTiming(4, { duration: 2600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    badgeB.value = withRepeat(
      withSequence(
        withTiming(5, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(-5, { duration: 3000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [float, tilt, badgeA, badgeB]);

  const blobStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }, { rotate: `${tilt.value}deg` }],
  }));

  const badgeStyleA = useAnimatedStyle(() => ({ transform: [{ translateY: badgeA.value }] }));
  const badgeStyleB = useAnimatedStyle(() => ({ transform: [{ translateY: badgeB.value }] }));

  return (
    <View style={[styles.container, { width: size + 80, height: size + 40 }]}>
      <Animated.View style={[styles.blobWrap, { width: size, height: size }, blobStyle]}>
        <Svg width={size} height={size} viewBox={`0 0 ${BLOB_VIEWBOX} ${BLOB_VIEWBOX}`}>
          <Defs>
            <SvgLinearGradient id="blobFill" x1="10%" y1="0%" x2="90%" y2="100%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.97" />
              <Stop offset="100%" stopColor="#FCEEF5" stopOpacity="0.82" />
            </SvgLinearGradient>
            {/* Soft halo that follows the blob instead of a rectangular box-shadow. */}
            <SvgRadialGradient id="blobGlow" cx="50%" cy="54%" rx="50%" ry="50%">
              <Stop offset="62%" stopColor="#6D28D9" stopOpacity="0.13" />
              <Stop offset="100%" stopColor="#6D28D9" stopOpacity="0" />
            </SvgRadialGradient>
          </Defs>

          <Ellipse cx={100} cy={108} rx={99} ry={92} fill="url(#blobGlow)" />
          <Path d={BLOB_PATH} fill="url(#blobFill)" stroke="rgba(255,255,255,0.92)" strokeWidth={1.5} />
        </Svg>

        <View style={styles.content}>
          {children ?? (
            <>
              {label ? (
                <AppText variant="caption" align="center">
                  {label}
                </AppText>
              ) : null}
              {value ? (
                <AppText variant="display" align="center" style={styles.value}>
                  {value}
                </AppText>
              ) : null}
              {sub ? (
                <AppText variant="caption" align="center" style={styles.sub}>
                  {sub}
                </AppText>
              ) : null}
            </>
          )}
        </View>
      </Animated.View>

      {badges.slice(0, 4).map((badge, index) => (
        <Animated.View
          key={`${badge.slot}-${index}`}
          style={[
            styles.badge,
            SLOT_STYLES[badge.slot],
            index % 2 === 0 ? badgeStyleA : badgeStyleB,
          ]}
        >
          <Ionicons name={badge.icon} size={17} color={badge.color ?? Colors.primary} />
          {badge.label ? (
            <AppText variant="micro" style={styles.badgeLabel}>
              {badge.label}
            </AppText>
          ) : null}
        </Animated.View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blobWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 28,
  },
  value: {
    marginTop: 2,
  },
  sub: {
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 44,
    height: 44,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    justifyContent: 'center',
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  badgeLabel: {
    color: Colors.textSecondary,
  },
});
