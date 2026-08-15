import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { BackgroundGradient } from '@/components/onboarding/background-gradient';
import { OnboardingGraphic } from '@/components/onboarding/onboarding-graphic';
import { IconButton } from '@/components/ui/icon-button';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { PageIndicator } from '@/components/ui/page-indicator';
import { useFinance } from '@/context/finance-context';

interface OnboardingSlide {
  id: number;
  title: string;
  subtitle: string;
  buttonText: string;
}

const SLIDES: OnboardingSlide[] = [
  {
    id: 1,
    title: 'Snap it, share it, done',
    subtitle: 'Screenshots become transactions automatically.',
    buttonText: 'Next',
  },
  {
    id: 2,
    title: 'Your data never leaves your phone',
    subtitle: 'Full local privacy, no cloud storage.',
    buttonText: 'Next →',
  },
  {
    id: 3,
    title: 'See your money clearly',
    subtitle: 'Automatic categorization and rich spend insights.',
    buttonText: 'Get Started',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { state, completeOnboarding } = useFinance();
  const [activeIndex, setActiveIndex] = useState<number>(0); // Start at Step 1

  if (state.settings.hasOnboarded) {
    return <Redirect href="/(tabs)" />;
  }

  const currentSlide = SLIDES[activeIndex];

  const finishOnboarding = () => {
    completeOnboarding();
    router.replace('/(tabs)');
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      setActiveIndex(prev => prev + 1);
    } else {
      finishOnboarding();
    }
  };

  const handleBack = () => {
    if (activeIndex > 0) {
      setActiveIndex(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    finishOnboarding();
  };

  return (
    <BackgroundGradient>
      <SafeAreaView style={styles.safeArea}>
        {/* Header Bar */}
        <View style={styles.header}>
          <IconButton
            iconName="arrow-back"
            onPress={handleBack}
            size={44}
            iconSize={20}
            color="#18181B"
            backgroundColor="rgba(255, 255, 255, 0.85)"
            style={{ opacity: activeIndex > 0 ? 1 : 0.35 }}
          />

          <Pressable onPress={handleSkip} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <AppText variant="button" style={styles.skipText}>
              Skip
            </AppText>
          </Pressable>
        </View>

        {/* Main Content Area */}
        <View style={styles.contentContainer}>
          {/* Step 1 / 2 / 3 Illustration Graphic */}
          <OnboardingGraphic stepIndex={activeIndex} />

          {/* Headline & Subtitle */}
          <View style={styles.textContainer}>
            <AppText variant="h1" align="center" style={styles.titleText}>
              {currentSlide.title}
            </AppText>
            <AppText variant="subtitle" align="center" style={styles.subtitleText}>
              {currentSlide.subtitle}
            </AppText>
          </View>

          {/* Page Dots Indicator */}
          <PageIndicator
            count={SLIDES.length}
            activeIndex={activeIndex}
            onSelect={index => setActiveIndex(index)}
          />
        </View>

        {/* Bottom Actions Section */}
        <View style={styles.footerContainer}>
          <AppButton
            title={currentSlide.buttonText}
            onPress={handleNext}
            variant="primary"
            size="lg"
          />
        </View>
      </SafeAreaView>
    </BackgroundGradient>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#18181B',
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  titleText: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: '#18181B',
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitleText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#52525B',
    maxWidth: 310,
    fontWeight: '400',
  },
  footerContainer: {
    paddingHorizontal: 28,
    paddingBottom: 24,
    gap: 16,
    alignItems: 'center',
  },
});
