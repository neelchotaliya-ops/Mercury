import { Tabs } from 'expo-router';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

import { FloatingTabBar } from '@/components/navigation/floating-tab-bar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={props => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        // Default is 'none' — tabs would otherwise swap with zero animation,
        // which is what made switching tabs read as "sudden" next to the
        // Stack's animated push/modal transitions everywhere else in the app.
        animation: 'shift',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size }) => <Ionicons name="swap-vertical-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
