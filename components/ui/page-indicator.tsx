import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useAppTheme } from '@/context/theme-context';

export interface PageIndicatorProps {
  count: number;
  activeIndex: number;
  onSelect?: (index: number) => void;
}

export const PageIndicator: React.FC<PageIndicatorProps> = ({
  count,
  activeIndex,
  onSelect,
}) => {
  const { colors } = useAppTheme();

  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => {
        const isActive = index === activeIndex;

        return (
          <Pressable
            key={index}
            onPress={() => onSelect?.(index)}
            disabled={!onSelect}
            style={({ pressed }) => [
              styles.dot,
              isActive ? styles.activeDot : styles.inactiveDot,
              {
                backgroundColor: isActive ? '#18181B' : '#D1D5DB',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 18,
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  inactiveDot: {
    width: 8,
    backgroundColor: '#D1D5DB',
  },
  activeDot: {
    width: 24,
    backgroundColor: '#18181B',
  },
});
