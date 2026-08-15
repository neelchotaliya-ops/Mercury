/**
 * Mercury App - Design System & Theme Engine
 * Consistent design tokens for colors, typography, spacing, border-radius, shadows, and component presets.
 */

import { Platform } from 'react-native';

const tintColorLight = '#8B5CF6';
const tintColorDark = '#A78BFA';

export const Colors = {
  light: {
    text: '#18181B',
    background: '#FAF9FA',
    tint: tintColorLight,
    icon: '#18181B',
    tabIconDefault: '#94A3B8',
    tabIconSelected: tintColorLight,

    primary: '#8B5CF6',
    primaryLight: '#F3E8FF',
    primaryDark: '#6D28D9',
    accent: '#EC4899',

    // Typography
    textPrimary: '#18181B',
    textSecondary: '#52525B',
    textMuted: '#94A3B8',
    textInverse: '#FFFFFF',

    // Card & Surfaces
    cardBackground: 'rgba(255, 255, 255, 0.95)',
    cardBorder: 'rgba(255, 255, 255, 0.9)',

    // Buttons & Controls
    buttonPrimaryBg: '#000000', // Pitch black CTA button
    buttonPrimaryText: '#FFFFFF',
    buttonSecondaryBg: 'rgba(0, 0, 0, 0.05)',
    buttonSecondaryText: '#18181B',
    
    // UI Elements
    iconMuted: '#94A3B8',
    border: '#E2E8F0',
    indicatorInactive: '#D1D5DB',
    indicatorActive: '#18181B',
    
    // Chart / Decorative Badges
    badgeBg1: '#FFFFFF',
    badgeIcon1: '#8B5CF6',
    badgeBg2: '#FFFFFF',
    badgeIcon2: '#8B5CF6',
    badgeBg3: '#FFFFFF',
    badgeIcon3: '#8B5CF6',

    // Decorative rings + floating nav
    ringColor: 'rgba(24, 24, 27, 0.08)',
    navBarBg: 'rgba(24, 24, 27, 0.96)',
    navPillBg: 'rgba(255, 255, 255, 0.16)',
    navIconActive: '#FFFFFF',
    navIconInactive: 'rgba(255, 255, 255, 0.45)',
  },
  dark: {
    text: '#F8FAFC',
    background: '#0F172A',
    tint: tintColorDark,
    icon: '#F8FAFC',
    tabIconDefault: '#64748B',
    tabIconSelected: tintColorDark,

    primary: '#A78BFA',
    primaryLight: '#2E1065',
    primaryDark: '#C084FC',
    accent: '#F472B6',

    // Typography
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    textInverse: '#0F172A',

    // Card & Surfaces
    cardBackground: 'rgba(30, 41, 59, 0.9)',
    cardBorder: 'rgba(255, 255, 255, 0.15)',

    // Buttons & Controls
    buttonPrimaryBg: '#000000',
    buttonPrimaryText: '#FFFFFF',
    buttonSecondaryBg: 'rgba(255, 255, 255, 0.1)',
    buttonSecondaryText: '#F8FAFC',

    // UI Elements
    iconMuted: '#64748B',
    border: '#334155',
    indicatorInactive: '#334155',
    indicatorActive: '#F8FAFC',

    // Chart / Decorative Badges
    badgeBg1: '#2E1065',
    badgeIcon1: '#C084FC',
    badgeBg2: '#2E1065',
    badgeIcon2: '#C084FC',
    badgeBg3: '#2E1065',
    badgeIcon3: '#C084FC',

    // Decorative rings + floating nav
    ringColor: 'rgba(248, 250, 252, 0.08)',
    navBarBg: 'rgba(15, 23, 42, 0.96)',
    navPillBg: 'rgba(255, 255, 255, 0.12)',
    navIconActive: '#FFFFFF',
    navIconInactive: 'rgba(248, 250, 252, 0.4)',
  },
};

// Exact Figma Background Gradient Palette
export const Gradients = {
  light: {
    background: ['#E9DDFF', '#FFB3B2', '#FAF9FA'],
    locations: [0, 0.5, 1.0],
    card: ['rgba(255, 255, 255, 0.98)', 'rgba(255, 245, 248, 0.75)'],
    progress: ['#EC4899', '#8B5CF6'],
  },
  dark: {
    background: ['#0F172A', '#1E1B4B', '#2E1065'],
    locations: [0, 0.5, 1.0],
    card: ['rgba(30, 41, 59, 0.9)', 'rgba(15, 23, 42, 0.6)'],
    progress: ['#F472B6', '#A78BFA'],
  },
};

// Typography Font Families - Sora for Titles & Manrope for Subtitles
export const Fonts = {
  title: {
    regular: 'Sora_400Regular',
    semibold: 'Sora_600SemiBold',
    bold: 'Sora_700Bold',
    extraBold: 'Sora_800ExtraBold',
  },
  subtitle: {
    regular: 'Manrope_400Regular',
    medium: 'Manrope_500Medium',
    semibold: 'Manrope_600SemiBold',
    bold: 'Manrope_700Bold',
  },
  sans: Platform.select({
    web: "Sora, 'Plus Jakarta Sans', system-ui, sans-serif",
    default: 'Sora_400Regular',
  }),
  rounded: 'Sora_400Regular',
  mono: 'Manrope_400Regular',
};

export const Typography = {
  fontSizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
    '5xl': 40,
  },
  fontWeights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    heavy: '800' as const,
  },
  lineHeights: {
    tight: 1.15,
    normal: 1.4,
    relaxed: 1.6,
  },
  letterSpacing: {
    tight: -0.5,
    normal: 0,
    wide: 0.5,
    wider: 1.5,
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
  xs: 6,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 9999,
  circle: 9999,
};

export const Shadows = {
  none: {},
  sm: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
    },
    android: { elevation: 2 },
    web: { boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)' },
  }),
  md: Platform.select({
    ios: {
      shadowColor: '#8B5CF6',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
    web: { boxShadow: '0px 8px 16px rgba(139, 92, 246, 0.1)' },
  }),
  lg: Platform.select({
    ios: {
      shadowColor: '#8B5CF6',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.15,
      shadowRadius: 28,
    },
    android: { elevation: 12 },
    web: { boxShadow: '0px 16px 28px rgba(139, 92, 246, 0.15)' },
  }),
  button: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
    },
    android: { elevation: 5 },
    web: { boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.25)' },
  }),
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
export type ColorSchemeType = 'light' | 'dark';
