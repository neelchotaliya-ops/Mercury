import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

export interface PageIndicatorProps {
  count: number;
  activeIndex: number;
  onSelect?: (index: number) => void;
}

const Dot: React.FC<{ active: boolean; onPress?: () => void }> = ({ active, onPress }) => {
  const animatedStyle = useAnimatedStyle(() => ({
    width: withSpring(active ? 26 : 7, { damping: 16, stiffness: 200 }),
    opacity: withSpring(active ? 1 : 0.35),
  }));

  return (
    <Pressable onPress={onPress} disabled={!onPress} hitSlop={10}>
      <Animated.View
        style={[styles.dot, { backgroundColor: active ? Colors.primary : Colors.textMuted }, animatedStyle]}
      />
    </Pressable>
  );
};

export const PageIndicator: React.FC<PageIndicatorProps> = ({ count, activeIndex, onSelect }) => (
  <View style={styles.container}>
    {Array.from({ length: count }).map((_, index) => (
      <Dot
        key={index}
        active={index === activeIndex}
        onPress={onSelect ? () => onSelect(index) : undefined}
      />
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 22,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
});
