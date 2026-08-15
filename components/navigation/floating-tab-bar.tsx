import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Colors, Gradients, BorderRadius, Shadows } from '@/constants/theme';

interface TabItemProps {
  focused: boolean;
  onPress: () => void;
  renderIcon: (color: string) => React.ReactNode;
}

const TabItem: React.FC<TabItemProps> = ({ focused, onPress, renderIcon }) => {
  const scale = useSharedValue(1);
  const dot = useSharedValue(focused ? 1 : 0);

  React.useEffect(() => {
    dot.value = withTiming(focused ? 1 : 0, { duration: 220 });
  }, [focused, dot]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: dot.value,
    transform: [{ scale: 0.4 + dot.value * 0.6 }],
  }));

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.84, { damping: 14, stiffness: 340 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 11, stiffness: 240 });
      }}
      style={styles.tabItem}
      hitSlop={8}
    >
      <Animated.View style={iconStyle}>
        {renderIcon(focused ? Colors.navIconActive : Colors.navIconInactive)}
      </Animated.View>
      <Animated.View style={[styles.activeDot, dotStyle]} />
    </Pressable>
  );
};

const CenterAction: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.9, { damping: 14, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 10, stiffness: 220 });
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
          options.tabBarIcon ? options.tabBarIcon({ focused, color, size: 23 }) : null
        }
      />
    );
  };

  return (
    <View style={[styles.wrapper, { paddingBottom: insets.bottom > 0 ? insets.bottom : 16 }]} pointerEvents="box-none">
      <View style={styles.bar}>
        <View style={styles.barSurface}>
          {Platform.OS !== 'android' && (
            <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={['rgba(255,255,255,0.82)', 'rgba(255,255,255,0.58)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>

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
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 68,
    ...Shadows.lifted,
  },
  barSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    overflow: 'hidden',
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
    gap: 5,
    width: 52,
    height: '100%',
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.navIconActive,
  },
  centerSlot: {
    width: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: -18,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    ...Shadows.floating,
  },
});
