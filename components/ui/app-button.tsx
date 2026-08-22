import React from 'react';
import { Pressable, StyleSheet, ViewStyle, TextStyle, ActivityIndicator, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Colors, Gradients, BorderRadius, Shadows, Spacing } from '@/constants/theme';
import { PressScale, Spring } from '@/constants/motion';
import { haptics } from '@/utils/haptics';

export type ButtonVariant = 'primary' | 'glass' | 'ghost' | 'text';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: TextStyle;
}

const SIZES: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { paddingVertical: 10, paddingHorizontal: Spacing.lg, fontSize: 13 },
  md: { paddingVertical: 14, paddingHorizontal: Spacing.xl, fontSize: 14 },
  lg: { paddingVertical: 18, paddingHorizontal: Spacing['2xl'], fontSize: 15 },
};

export const AppButton: React.FC<AppButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  disabled = false,
  loading = false,
  fullWidth = true,
  style,
  textStyle,
}) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const dims = SIZES[size];
  const isDisabled = disabled || loading;

  const textColor =
    variant === 'primary'
      ? Colors.ctaText
      : variant === 'text'
        ? Colors.textSecondary
        : Colors.textPrimary;

  const handlePress = () => {
    if (isDisabled) return;
    haptics.press();
    onPress();
  };

  const container: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: BorderRadius.pill,
    paddingVertical: variant === 'text' ? 4 : dims.paddingVertical,
    paddingHorizontal: variant === 'text' ? 4 : dims.paddingHorizontal,
    overflow: 'hidden',
    opacity: isDisabled ? 0.4 : 1,
    ...(fullWidth ? { width: '100%' } : {}),
    ...(variant === 'primary'
      ? { backgroundColor: Colors.ctaBg, ...Shadows.floating }
      : {}),
    ...(variant === 'glass'
      ? { backgroundColor: Colors.controlBg, borderWidth: 1, borderColor: Colors.glassBorder }
      : {}),
    ...(variant === 'ghost'
      ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.track }
      : {}),
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      onPressIn={() => {
        scale.value = withSpring(PressScale.button, Spring.press);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, Spring.settle);
      }}
      style={fullWidth ? styles.fullWidth : undefined}
    >
      <Animated.View style={[container, animatedStyle, style]}>
        {variant === 'primary' && (
          <LinearGradient
            colors={Gradients.cta as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}

        {loading ? (
          <ActivityIndicator color={textColor} size="small" />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={dims.fontSize + 3} color={textColor} /> : null}
            <AppText variant="button" color={textColor} style={[{ fontSize: dims.fontSize }, textStyle]}>
              {title}
            </AppText>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  fullWidth: {
    width: '100%',
  },
});
