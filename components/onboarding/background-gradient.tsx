import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gradients } from '@/constants/theme';

export interface BackgroundGradientProps {
  children: React.ReactNode;
}

export const BackgroundGradient: React.FC<BackgroundGradientProps> = ({ children }) => {
  return (
    <View style={styles.container}>
      {/* Exact Figma Gradient Specs: 0%: #E9DDFF, 50%: #FFB3B2, 100%: #FAF9FA */}
      <LinearGradient
        colors={Gradients.light.background as [string, string, string]}
        locations={Gradients.light.locations as [number, number, number]}
        start={{ x: 0.5, y: 0.0 }}
        end={{ x: 0.5, y: 1.0 }}
        style={StyleSheet.absoluteFill}
      />

      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9FA',
  },
});
