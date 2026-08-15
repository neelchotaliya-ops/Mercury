import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';

export interface AmountInputProps {
  value: string;
  onChangeValue: (value: string) => void;
  currencySymbol: string;
  accentColor?: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;
type KeyValue = (typeof KEYS)[number];

const KeypadKey: React.FC<{ keyValue: KeyValue; onPress: () => void }> = ({ keyValue, onPress }) => {
  const scale = useSharedValue(1);
  const bg = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: `rgba(255, 255, 255, ${bg.value * 0.7})`,
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.88, { damping: 13, stiffness: 380 });
        bg.value = withSpring(1, { damping: 18, stiffness: 260 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 10, stiffness: 250 });
        bg.value = withSpring(0, { damping: 18, stiffness: 200 });
      }}
      style={styles.keySlot}
    >
      <Animated.View style={[styles.key, animatedStyle]}>
        {keyValue === 'back' ? (
          <Ionicons name="backspace-outline" size={21} color={Colors.textSecondary} />
        ) : (
          <AppText variant="h2" style={styles.keyLabel}>
            {keyValue}
          </AppText>
        )}
      </Animated.View>
    </Pressable>
  );
};

export const AmountInput: React.FC<AmountInputProps> = ({
  value,
  onChangeValue,
  currencySymbol,
  accentColor,
}) => {
  const handleKey = (key: KeyValue) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

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

  const tint = accentColor ?? Colors.textPrimary;
  const isEmpty = value.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.displayRow}>
        <AppText variant="h2" color={isEmpty ? Colors.textMuted : tint} style={styles.symbol}>
          {currencySymbol}
        </AppText>
        <AppText
          variant="display"
          color={isEmpty ? Colors.textMuted : tint}
          style={styles.amount}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {isEmpty ? '0' : value}
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
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 14,
  },
  symbol: {
    fontSize: 22,
  },
  amount: {
    fontSize: 46,
    lineHeight: 54,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  keySlot: {
    width: '33.333%',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  key: {
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyLabel: {
    fontSize: 23,
  },
});
