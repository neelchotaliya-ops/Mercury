import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';

import { Colors, Gradients } from '@/constants/theme';
import { TopographicField } from '@/components/ui/topographic-field';

export interface GradientScreenProps {
  children: React.ReactNode;
  /** Decorative contour field behind the content. */
  contours?: 'none' | 'top' | 'full';
  edges?: readonly Edge[];
  contentStyle?: StyleProp<ViewStyle>;
}

export const GradientScreen: React.FC<GradientScreenProps> = ({
  children,
  contours = 'none',
  edges = ['top'],
  contentStyle,
}) => {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={Gradients.screen.colors as [string, string, string, string]}
        locations={Gradients.screen.locations as [number, number, number, number]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {contours !== 'none' && <TopographicField warm={contours === 'full'} />}

      <SafeAreaView style={[styles.content, contentStyle]} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
  },
});
