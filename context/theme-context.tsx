import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { Colors, ColorSchemeType, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

interface ThemeContextType {
  colorScheme: ColorSchemeType;
  colors: typeof Colors.light;
  typography: typeof Typography;
  spacing: typeof Spacing;
  borderRadius: typeof BorderRadius;
  shadows: typeof Shadows;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export interface ThemeProviderProps {
  children: React.ReactNode;
  overrideColorScheme?: ColorSchemeType;
}

export const AppThemeProvider: React.FC<ThemeProviderProps> = ({ children, overrideColorScheme }) => {
  const systemColorScheme = useRNColorScheme() as ColorSchemeType || 'light';
  const colorScheme = overrideColorScheme || systemColorScheme;

  const value = useMemo(() => {
    const isDark = colorScheme === 'dark';
    const colors = isDark ? Colors.dark : Colors.light;

    return {
      colorScheme,
      colors,
      typography: Typography,
      spacing: Spacing,
      borderRadius: BorderRadius,
      shadows: Shadows,
      isDark,
    };
  }, [colorScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    // Fallback to light mode defaults if used outside provider
    return {
      colorScheme: 'light',
      colors: Colors.light,
      typography: Typography,
      spacing: Spacing,
      borderRadius: BorderRadius,
      shadows: Shadows,
      isDark: false,
    };
  }
  return context;
};
