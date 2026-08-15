import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/context/theme-context';

export interface AmountInputProps {
  value: string;
  onChangeValue: (value: string) => void;
  currencySymbol: string;
  accentColor?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;

interface KeypadKeyProps {
  keyValue: (typeof KEYS)[number];
  onPress: () => void;
}

const KeypadKey: React.FC<KeypadKeyProps> = ({ keyValue, onPress }) => {
  const { colors } = useAppTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.8, { damping: 12, stiffness: 350 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 10, stiffness: 250 });
      }}
      style={styles.key}
    >
      <Animated.View style={animatedStyle}>
        {keyValue === 'back' ? (
          <Ionicons name="backspace-outline" size={22} color={colors.textPrimary} />
        ) : (
          <AppText variant="h2" style={{ color: colors.textPrimary }}>
            {keyValue}
          </AppText>
        )}
      </Animated.View>
    </Pressable>
  );
};

export const AmountInput: React.FC<AmountInputProps> = ({ value, onChangeValue, currencySymbol, accentColor }) => {
  const { colors } = useAppTheme();

  const handleKey = (key: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    if (key === 'back') {
      onChangeValue(value.length > 0 ? value.slice(0, -1) : value);
      return;
    }
    if (key === '.') {
      if (value.includes('.')) return;
      onChangeValue(value.length === 0 ? '0.' : `${value}.`);
      return;
    }

    const [, decimals] = value.split('.');
    if (decimals && decimals.length >= 2) return;
    if (value === '0') {
      onChangeValue(key);
      return;
    }
    onChangeValue(`${value}${key}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.displayRow}>
        <AppText variant="h1" style={[styles.currencySymbol, { color: accentColor ?? colors.textPrimary }]}>
          {currencySymbol}
        </AppText>
        <AppText variant="h1" style={[styles.amountText, { color: accentColor ?? colors.textPrimary }]} numberOfLines={1}>
          {value.length > 0 ? value : '0'}
        </AppText>
      </View>

      <View style={styles.keypad}>
        {KEYS.map(key => (
          <KeypadKey key={key} keyValue={key} onPress={() => handleKey(key)} />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  currencySymbol: {
    fontSize: 28,
    marginRight: 6,
  },
  amountText: {
    fontSize: 44,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  key: {
    width: '33.333%',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
