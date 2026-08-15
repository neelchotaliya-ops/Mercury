import React, { createContext, useContext } from 'react';

import {
  Colors,
  Gradients,
  Typography,
  Spacing,
  BorderRadius,
  Shadows,
} from '@/constants/theme';

interface ThemeContextType {
  colors: typeof Colors;
  gradients: typeof Gradients;
  typography: typeof Typography;
  spacing: typeof Spacing;
  borderRadius: typeof BorderRadius;
  shadows: typeof Shadows;
}

const themeValue: ThemeContextType = {
  colors: Colors,
  gradients: Gradients,
  typography: Typography,
  spacing: Spacing,
  borderRadius: BorderRadius,
  shadows: Shadows,
};

const ThemeContext = createContext<ThemeContextType>(themeValue);

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeContext.Provider value={themeValue}>{children}</ThemeContext.Provider>
);

export const useAppTheme = (): ThemeContextType => useContext(ThemeContext);
