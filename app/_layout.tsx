import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';

import {
  useFonts,
  Sora_400Regular,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';

import { ShareIntentProvider } from 'expo-share-intent';

import { AppThemeProvider } from '@/context/theme-context';
import { FinanceProvider, useFinance } from '@/context/finance-context';
import { useSharedReceipt } from '@/hooks/use-shared-receipt';
import { PersistErrorBanner } from '@/components/ui/persist-error-banner';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: 'index',
};

function RootNavigator() {
  const { state } = useFinance();

  useEffect(() => {
    if (state.isLoaded) {
      SplashScreen.hideAsync();
    }
  }, [state.isLoaded]);

  // Only route a shared screenshot once accounts and categories exist to match against.
  useSharedReceipt(state.isLoaded && state.settings.hasOnboarded);

  if (!state.isLoaded) {
    return null;
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="accounts" />
        <Stack.Screen name="add-transaction" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-account" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-budget" options={{ presentation: 'modal' }} />
        <Stack.Screen name="manage-categories" options={{ presentation: 'modal' }} />
        <Stack.Screen name="quick-presets" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="db-diagnostics" options={{ presentation: 'modal' }} />
      </Stack>
      <PersistErrorBanner />
      <StatusBar style="dark" />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Sora_400Regular,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // ShareIntentProvider has to wrap every other provider so the native module
  // is reachable when the app is cold-started by a share.
  return (
    <ShareIntentProvider>
      <FinanceProvider>
        <AppThemeProvider>
          <RootNavigator />
        </AppThemeProvider>
      </FinanceProvider>
    </ShareIntentProvider>
  );
}
