import { useEffect, useState } from 'react';
import { View } from 'react-native';
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
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';

import { ShareIntentProvider } from 'expo-share-intent';

import { FinanceProvider, useFinance } from '@/context/finance-context';
import { useSharedReceipt } from '@/hooks/use-shared-receipt';
import { PersistErrorBanner } from '@/components/ui/persist-error-banner';
import { BackgroundOperationBanner } from '@/components/ui/background-operation-banner';
import { AppSplash } from '@/components/ui/app-splash';
import { ensureNotificationsReady } from '@/utils/notifications';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  anchor: 'index',
};

function RootNavigator() {
  const { state } = useFinance();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    // Hand over from native splash to interactive JS splash immediately
    SplashScreen.hideAsync().catch(() => {});
    // Requested once up front (rather than lazily on the first completed
    // operation) so the permission is already granted by the time an
    // operation finishes while backgrounded — the OS can't show a
    // permission prompt while the app isn't foregrounded.
    void ensureNotificationsReady();
  }, []);

  // Only route a shared screenshot once accounts and categories exist to match against.
  useSharedReceipt(state.isLoaded && state.settings.hasOnboarded);

  return (
    <View style={{ flex: 1 }}>
      {state.isLoaded ? (
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
          <Stack.Screen name="manage-subcategories" options={{ presentation: 'modal' }} />
          <Stack.Screen name="manage" options={{ presentation: 'modal' }} />
          <Stack.Screen name="manage-splits" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-recurring" options={{ presentation: 'modal' }} />
          <Stack.Screen name="add-split" options={{ presentation: 'modal' }} />
          <Stack.Screen name="split-detail" options={{ presentation: 'modal' }} />
          <Stack.Screen name="bank-import" options={{ presentation: 'modal' }} />
          <Stack.Screen name="quick-presets" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="fill-test-data" options={{ presentation: 'modal' }} />
          <Stack.Screen name="db-diagnostics" options={{ presentation: 'modal' }} />
        </Stack>
      ) : null}

      {!splashDone ? (
        <AppSplash
          isReady={state.isLoaded}
          onAnimationComplete={() => setSplashDone(true)}
        />
      ) : null}

      <PersistErrorBanner />
      <BackgroundOperationBanner />
      <StatusBar style="dark" />
    </View>
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
    Manrope_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // ShareIntentProvider has to wrap every other provider so the native module
  // is reachable when the app is cold-started by a share.
  return (
    <ShareIntentProvider>
      <FinanceProvider>
        <RootNavigator />
      </FinanceProvider>
    </ShareIntentProvider>
  );
}
