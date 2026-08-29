import React, { useEffect } from 'react';
import { StyleSheet, View, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import Constants from 'expo-constants';

import { AppText } from '@/components/ui/app-text';
import { Colors } from '@/constants/theme';
import { Duration, Ease } from '@/constants/motion';

interface AppSplashProps {
  isReady: boolean;
  onAnimationComplete?: () => void;
}

export const AppSplash: React.FC<AppSplashProps> = ({ isReady, onAnimationComplete }) => {
  const insets = useSafeAreaInsets();
  const opacity = useSharedValue(1);
  const version = Constants.expoConfig?.version ?? '1.0.0';

  useEffect(() => {
    if (isReady) {
      // Smooth fade-out after resources/DB are ready
      opacity.value = withTiming(
        0,
        { duration: Duration.emphasis, easing: Ease.out },
        finished => {
          if (finished && onAnimationComplete) {
            runOnJS(onAnimationComplete)();
          }
        }
      );
    }
  }, [isReady, onAnimationComplete, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.container, animatedStyle]}
      pointerEvents={isReady ? 'none' : 'auto'}
    >
      <View style={styles.centerWrap}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      <View style={[styles.bottomWrap, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <AppText variant="caption" color={Colors.textMuted} style={styles.versionText}>
          v{version}
        </AppText>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surfaceOpaque,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 140,
    height: 140,
    borderRadius: 30,
  },
  bottomWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionText: {
    letterSpacing: 1.2,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
});
