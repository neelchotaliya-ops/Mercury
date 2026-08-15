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

      {contours !== 'none' && (
        <>
          <TopographicField size={520} rings={8} rotate={-12} style={styles.contourTop} />
          {contours === 'full' && (
            <TopographicField size={420} rings={6} rotate={24} warm style={styles.contourBottom} />
          )}
        </>
      )}

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
  contourTop: {
    top: -170,
    left: -110,
  },
  contourBottom: {
    bottom: -150,
    right: -140,
  },
});
