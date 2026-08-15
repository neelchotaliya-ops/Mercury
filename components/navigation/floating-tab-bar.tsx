import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { useAppTheme } from '@/context/theme-context';

interface TabButtonProps {
  focused: boolean;
  onPress: () => void;
  renderIcon: (color: string) => React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ focused, onPress, renderIcon }) => {
  const { colors, borderRadius } = useAppTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.85, { damping: 12, stiffness: 300 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 10, stiffness: 220 });
  };
  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabButton}
      hitSlop={8}
    >
      <Animated.View
        style={[
          styles.iconWrap,
          { borderRadius: borderRadius.pill, backgroundColor: focused ? colors.navPillBg : 'transparent' },
          animatedStyle,
        ]}
      >
        {renderIcon(focused ? colors.navIconActive : colors.navIconInactive)}
      </Animated.View>
    </Pressable>
  );
};

export const FloatingTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  const { colors, borderRadius } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
      <View style={[styles.bar, { backgroundColor: colors.navBarBg, borderRadius: borderRadius.pill }]}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabButton
              key={route.key}
              focused={focused}
              onPress={onPress}
              renderIcon={color =>
                options.tabBarIcon ? options.tabBarIcon({ focused, color, size: 22 }) : null
              }
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
