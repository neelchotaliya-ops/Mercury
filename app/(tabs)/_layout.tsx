import { Tabs } from 'expo-router';
import React from 'react';

import { FloatingTabBar } from '@/components/navigation/floating-tab-bar';
import { TabGradientIcon } from '@/components/navigation/tab-gradient-icon';

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
          tabBarIcon: ({ focused, size }) => (
            <TabGradientIcon name="home" focused={focused} size={size ?? 24} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Activity',
          tabBarIcon: ({ focused, size }) => (
            <TabGradientIcon name="activity" focused={focused} size={size ?? 24} />
          ),
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ focused, size }) => (
            <TabGradientIcon name="budgets" focused={focused} size={size ?? 24} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Insights',
          tabBarIcon: ({ focused, size }) => (
            <TabGradientIcon name="reports" focused={focused} size={size ?? 24} />
          ),
        }}
      />
    </Tabs>
  );
}
