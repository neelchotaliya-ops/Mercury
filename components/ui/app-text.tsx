import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle, StyleProp } from 'react-native';

import { Colors, Fonts, Typography } from '@/constants/theme';

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'subtitle'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'captionStrong'
  | 'micro'
  | 'label'
  | 'button'
  | 'link'
  | 'amount';

export interface AppTextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

const VARIANTS: Record<TextVariant, TextStyle> = {
  display: {
    fontFamily: Fonts.title.extraBold,
    fontSize: Typography.fontSizes['4xl'],
    lineHeight: 40,
    letterSpacing: Typography.letterSpacing.tighter,
    color: Colors.textPrimary,
  },
  h1: {
    fontFamily: Fonts.title.extraBold,
    fontSize: Typography.fontSizes['3xl'],
    lineHeight: 34,
    letterSpacing: Typography.letterSpacing.tight,
    color: Colors.textPrimary,
  },
  h2: {
    fontFamily: Fonts.title.bold,
    fontSize: Typography.fontSizes['2xl'],
    lineHeight: 30,
    letterSpacing: Typography.letterSpacing.tight,
    color: Colors.textPrimary,
  },
  h3: {
    fontFamily: Fonts.title.semibold,
    fontSize: Typography.fontSizes.lg,
    lineHeight: 23,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontFamily: Fonts.body.regular,
    fontSize: Typography.fontSizes.md,
    lineHeight: 23,
    color: Colors.textSecondary,
  },
  body: {
    fontFamily: Fonts.body.medium,
    fontSize: Typography.fontSizes.md,
    lineHeight: 21,
    color: Colors.textPrimary,
  },
  bodyStrong: {
    fontFamily: Fonts.body.semibold,
    fontSize: Typography.fontSizes.md,
    lineHeight: 21,
    color: Colors.textPrimary,
  },
  caption: {
    fontFamily: Fonts.body.medium,
    fontSize: Typography.fontSizes.sm,
    lineHeight: 18,
    color: Colors.textMuted,
  },
  captionStrong: {
    fontFamily: Fonts.body.bold,
    fontSize: Typography.fontSizes.sm,
    lineHeight: 18,
    color: Colors.textMuted,
  },
  micro: {
    fontFamily: Fonts.body.semibold,
    fontSize: Typography.fontSizes.xs,
    lineHeight: 15,
    color: Colors.textMuted,
  },
  label: {
    fontFamily: Fonts.body.bold,
    fontSize: Typography.fontSizes.xs,
    lineHeight: 15,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: Colors.textMuted,
  },
  button: {
    fontFamily: Fonts.title.bold,
    fontSize: Typography.fontSizes.md,
    letterSpacing: 0.1,
    color: Colors.ctaText,
  },
  link: {
    fontFamily: Fonts.body.bold,
    fontSize: Typography.fontSizes.sm,
    color: Colors.primary,
  },
  amount: {
    fontFamily: Fonts.title.bold,
    fontSize: Typography.fontSizes.md,
    letterSpacing: Typography.letterSpacing.tight,
    color: Colors.textPrimary,
  },
};

export const AppText: React.FC<AppTextProps> = ({
  variant = 'body',
  color,
  align,
  style,
  children,
  ...rest
}) => (
  <RNText
    style={[VARIANTS[variant], color ? { color } : null, align ? { textAlign: align } : null, style]}
    {...rest}
  >
    {children}
  </RNText>
);
