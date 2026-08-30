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
  variant?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = 'light',
  style,
}: SegmentedControlProps<T>) {
  const isDark = variant === 'dark';

  return (
    <View style={[styles.container, style]}>
      {options.map(option => {
        const active = option.key === value;
        const activeTextColor = isDark ? '#FFFFFF' : (option.activeColor ?? Colors.textPrimary);
        const activeIconColor = isDark ? '#FFFFFF' : (option.activeColor ?? Colors.textPrimary);

        return (
          <Pressable
            key={option.key}
            onPress={() => {
              haptics.selection();
              onChange(option.key);
            }}
            style={[
              styles.segment,
              active && (isDark ? styles.segmentActiveDark : styles.segmentActive),
            ]}
          >
            {option.icon ? (
              <Ionicons
                name={option.icon}
                size={15}
                color={active ? activeIconColor : Colors.textMuted}
              />
            ) : null}
            <AppText
              variant="micro"
              color={active ? activeTextColor : Colors.textMuted}
              style={{ fontWeight: active ? '700' : '500' }}
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
    paddingVertical: 10,
    borderRadius: BorderRadius.pill,
  },
  segmentActive: {
    backgroundColor: Colors.surfaceOpaque,
    ...Shadows.soft,
  },
  segmentActiveDark: {
    backgroundColor: Colors.ctaBg,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
});
