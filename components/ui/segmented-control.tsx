import React from 'react';
import { View, StyleSheet, Pressable, ViewStyle, StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { Colors, BorderRadius, Shadows } from '@/constants/theme';
import { haptics } from '@/utils/haptics';

export interface SegmentOption<T extends string> {
  key: T;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  activeColor?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  return (
    <View style={[styles.container, style]}>
      {options.map(option => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            onPress={() => {
              haptics.selection();
              onChange(option.key);
            }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={15}
                color={active ? (option.activeColor ?? Colors.textPrimary) : Colors.textMuted}
              />
            ) : null}
            <AppText
              variant="micro"
              color={active ? (option.activeColor ?? Colors.textPrimary) : Colors.textMuted}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(25, 21, 39, 0.05)',
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: BorderRadius.pill,
  },
  segmentActive: {
    backgroundColor: Colors.surfaceOpaque,
    ...Shadows.soft,
  },
});
