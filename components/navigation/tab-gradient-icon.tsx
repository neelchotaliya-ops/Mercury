import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

export type TabIconName = 'home' | 'activity' | 'budgets' | 'reports';

interface TabGradientIconProps {
  name: TabIconName;
  focused: boolean;
  size?: number;
}

export const TabGradientIcon: React.FC<TabGradientIconProps> = ({
  name,
  focused,
  size = 24,
}) => {
  const gradId = `tabGrad_${name}`;
  const inactiveColor = '#A79FBA';

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Defs>
        <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#8B5CF6" />
          <Stop offset="100%" stopColor="#EC4899" />
        </LinearGradient>
      </Defs>

      {name === 'home' && (
        <Path
          d="M3 10.5 12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H15a1 1 0 0 1-1-1v-5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v5a1 1 0 0 1-1 1H4.5A1.5 1.5 0 0 1 3 20v-9.5Z"
          stroke={focused ? `url(#${gradId})` : inactiveColor}
          strokeWidth={focused ? 2.1 : 1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}

      {name === 'activity' && (
        <>
          <Path
            d="M7.5 4v13.5M7.5 17.5l-4-4M7.5 17.5l4-4"
            stroke={focused ? `url(#${gradId})` : inactiveColor}
            strokeWidth={focused ? 2.2 : 1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M16.5 20V6.5M16.5 6.5l4 4M16.5 6.5l-4 4"
            stroke={focused ? `url(#${gradId})` : inactiveColor}
            strokeWidth={focused ? 2.2 : 1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}

      {name === 'budgets' && (
        <>
          <Path
            d="M21.21 15.89A10 10 0 1 1 8 2.83"
            stroke={focused ? `url(#${gradId})` : inactiveColor}
            strokeWidth={focused ? 2.1 : 1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path
            d="M22 12A10 10 0 0 0 12 2v10z"
            stroke={focused ? `url(#${gradId})` : inactiveColor}
            strokeWidth={focused ? 2.1 : 1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      )}

      {name === 'reports' && (
        <>
          <Path
            d="M18 20V10M12 20V4M6 20v-6"
            stroke={focused ? `url(#${gradId})` : inactiveColor}
            strokeWidth={focused ? 2.4 : 1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </Svg>
  );
};
