/**
 * Mercury Design System
 * A single, light "soft glass" theme: lavender-to-blush gradients, frosted
 * surfaces, organic blob shapes, and one purple-pink accent ramp.
 */

import { Platform } from 'react-native';

export const Colors = {
  // Base
  background: '#F3EDFB',
  textPrimary: '#191527',
  textSecondary: '#6B6480',
  textMuted: '#A29BB4',
  textInverse: '#FFFFFF',

  // Brand
  primary: '#8B5CF6',
  primarySoft: '#EFE6FD',
  primaryDeep: '#6D28D9',
  accent: '#F0A9D0',

  // Semantic (muted so they read as designed, not alert-red/green)
  income: '#2EA97C',
  incomeSoft: 'rgba(46, 169, 124, 0.12)',
  expense: '#E05C7E',
  expenseSoft: 'rgba(224, 92, 126, 0.12)',

  // Glass surfaces
  glassBorder: 'rgba(255, 255, 255, 0.72)',
  glassBorderSoft: 'rgba(255, 255, 255, 0.42)',
  glassTint: 'rgba(255, 255, 255, 0.5)',

  // Controls
  ctaBg: '#17131F',
  ctaText: '#FFFFFF',
  controlBg: 'rgba(255, 255, 255, 0.55)',
  controlBgActive: 'rgba(255, 255, 255, 0.95)',
  track: 'rgba(25, 21, 39, 0.07)',
  divider: 'rgba(25, 21, 39, 0.06)',

  // Navigation
  navIconActive: '#8B5CF6',
  navIconInactive: '#A79FBA',

  // Decorative contour lines
  contour: 'rgba(139, 92, 246, 0.11)',
  contourWarm: 'rgba(236, 138, 184, 0.10)',
};

export const Gradients = {
  /** Full-screen background wash */
  screen: {
    colors: ['#EFE4FC', '#F7E2EE', '#FDF0E9', '#EFF0F7'],
    locations: [0, 0.34, 0.66, 1],
  },
  /** Standard frosted card fill, layered over a BlurView */
  glass: ['rgba(255, 255, 255, 0.62)', 'rgba(255, 255, 255, 0.28)'],
  /** Brighter frosted fill for hero surfaces */
  glassStrong: ['rgba(255, 255, 255, 0.92)', 'rgba(255, 244, 250, 0.62)'],
  /** Organic hero blob fill */
  blob: ['rgba(255, 255, 255, 0.96)', 'rgba(252, 238, 245, 0.78)'],
  /** Progress fills, pink to purple */
  progress: ['#F5A8CE', '#A78BFA'],
  /** Primary CTA */
  cta: ['#2A2138', '#17131F'],
};

export const Fonts = {
  title: {
    regular: 'Sora_400Regular',
    semibold: 'Sora_600SemiBold',
    bold: 'Sora_700Bold',
    extraBold: 'Sora_800ExtraBold',
  },
  body: {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
  },
};

export const Typography = {
  fontSizes: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 34,
    '5xl': 42,
  },
  letterSpacing: {
    tighter: -1,
    tight: -0.5,
    normal: 0,
    wide: 0.4,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
};

export const BorderRadius = {
  xs: 10,
  sm: 16,
  md: 22,
  lg: 30,
  xl: 38,
  pill: 999,
};

const shadow = (
  y: number,
  radius: number,
  opacity: number,
  color: string,
  elevation: number
) =>
  Platform.select({
    ios: {
      shadowColor: color,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: radius,
    },
    android: { elevation },
    web: {
      boxShadow: `0px ${y}px ${radius}px rgba(${color === '#17131F' ? '23, 19, 31' : '109, 40, 217'}, ${opacity})`,
    },
    default: {},
  });

export const Shadows = {
  none: {},
  /** Resting cards */
  soft: shadow(8, 24, 0.07, '#6D28D9', 3),
  /** Hero surfaces */
  lifted: shadow(18, 38, 0.12, '#6D28D9', 8),
  /** Floating nav + FAB */
  floating: shadow(12, 30, 0.2, '#17131F', 12),
};

export const Theme = {
  Colors,
  Gradients,
  Fonts,
  Typography,
  Spacing,
  BorderRadius,
  Shadows,
};

export type ThemeType = typeof Theme;
