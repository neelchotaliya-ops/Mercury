import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import { Colors, Gradients, BorderRadius, Shadows } from '@/constants/theme';
import { haptics } from '@/utils/haptics';
import { PressScale, Spring } from '@/constants/motion';

interface TabItemProps {
  focused: boolean;
  onPress: () => void;
  renderIcon: (color: string) => React.ReactNode;
}

const TabItem: React.FC<TabItemProps> = ({ focused, onPress, renderIcon }) => {
  const scale = useSharedValue(1);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    haptics.selection();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(PressScale.control, Spring.press);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, Spring.settle);
      }}
      style={styles.tabItem}
      hitSlop={8}
    >
      <Animated.View style={iconStyle}>
        {renderIcon(focused ? Colors.navIconActive : Colors.navIconInactive)}
      </Animated.View>
    </Pressable>
  );
};

const CenterAction: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    haptics.press();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.88, Spring.press);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, Spring.settle);
      }}
      style={styles.centerSlot}
    >
      <Animated.View style={[styles.centerButton, animatedStyle]}>
        <LinearGradient
          colors={Gradients.cta as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name="add" size={26} color={Colors.ctaText} />
      </Animated.View>
    </Pressable>
  );
};

export const FloatingTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const half = Math.ceil(state.routes.length / 2);
  const left = state.routes.slice(0, half);
  const right = state.routes.slice(half);

  const renderTab = (route: (typeof state.routes)[number]) => {
    const index = state.routes.findIndex(r => r.key === route.key);
    const { options } = descriptors[route.key];
    const focused = state.index === index;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <TabItem
        key={route.key}
        focused={focused}
        onPress={onPress}
        renderIcon={color =>
          options.tabBarIcon ? options.tabBarIcon({ focused, color, size: 22 }) : null
        }
      />
    );
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 }]} pointerEvents="box-none">
      <View style={styles.bar}>
        <View style={styles.group}>{left.map(renderTab)}</View>
        <CenterAction onPress={() => router.push('/add-transaction')} />
        <View style={styles.group}>{right.map(renderTab)}</View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 64,
    backgroundColor: Colors.surfaceOpaque,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: 'rgba(25, 21, 39, 0.08)',
    ...Shadows.floating,
  },
  group: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    height: '100%',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: '100%',
  },
  centerSlot: {
    width: 56,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#17131F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
