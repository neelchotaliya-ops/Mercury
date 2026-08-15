import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';

import { useAppTheme } from '@/context/theme-context';
import { Gradients } from '@/constants/theme';
import { TopographicRings } from '@/components/ui/topographic-rings';

export interface GradientScreenProps {
  children: React.ReactNode;
  showRings?: boolean;
  edges?: readonly Edge[];
  contentStyle?: ViewStyle;
}

export const GradientScreen: React.FC<GradientScreenProps> = ({
  children,
  showRings = false,
  edges = ['top'],
  contentStyle,
}) => {
  const { colorScheme } = useAppTheme();
  const gradient = Gradients[colorScheme];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={gradient.background as [string, string, string]}
        locations={gradient.locations as [number, number, number]}
        start={{ x: 0.5, y: 0.0 }}
        end={{ x: 0.5, y: 1.0 }}
        style={StyleSheet.absoluteFill}
      />
      {showRings ? <TopographicRings style={styles.rings} /> : null}
      <SafeAreaView style={[styles.content, contentStyle]} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  rings: {
    top: -60,
    alignSelf: 'center',
  },
});
