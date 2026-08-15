import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { GradientScreen } from '@/components/ui/gradient-screen';
import { OrganicHero } from '@/components/ui/organic-hero';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { IconButton } from '@/components/ui/icon-button';
import { PageIndicator } from '@/components/ui/page-indicator';
import { OnboardingGlyph } from '@/components/onboarding/onboarding-glyph';
import { useFinance } from '@/context/finance-context';
import { Colors, Spacing } from '@/constants/theme';

interface Slide {
  title: string;
  subtitle: string;
  cta: string;
}

const SLIDES: Slide[] = [
  {
    title: 'Every rupee, in one place',
    subtitle: 'Log spending in seconds and always know where your money stands.',
    cta: 'Next',
  },
  {
    title: 'Your data never leaves your phone',
    subtitle: 'No account, no cloud, no tracking. Everything is stored locally.',
    cta: 'Next',
  },
  {
    title: 'See your money clearly',
    subtitle: 'Budgets that hold you accountable and insights that actually explain things.',
    cta: 'Get started',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { state, completeOnboarding } = useFinance();
  const [index, setIndex] = useState(0);

  if (state.settings.hasOnboarded) {
    return <Redirect href="/(tabs)" />;
  }

  const slide = SLIDES[index];

  const finish = () => {
    completeOnboarding();
    router.replace('/(tabs)');
  };

  const next = () => (index < SLIDES.length - 1 ? setIndex(i => i + 1) : finish());

  return (
    <GradientScreen contours="full">
      <View style={styles.header}>
        <View style={styles.backSlot}>
          {index > 0 ? (
            <IconButton iconName="arrow-back" onPress={() => setIndex(i => i - 1)} size={42} />
          ) : null}
        </View>
        <Pressable onPress={finish} hitSlop={10}>
          <AppText variant="link" color={Colors.textSecondary}>
            Skip
          </AppText>
        </Pressable>
      </View>

      <View style={styles.main}>
        <OrganicHero size={256}>
          <OnboardingGlyph step={index} size={158} />
        </OrganicHero>

        <Animated.View key={index} entering={FadeInDown.duration(420)} style={styles.copy}>
          <AppText variant="h1" align="center">
            {slide.title}
          </AppText>
          <AppText variant="subtitle" align="center" style={styles.subtitle}>
            {slide.subtitle}
          </AppText>
        </Animated.View>

        <PageIndicator count={SLIDES.length} activeIndex={index} onSelect={setIndex} />
      </View>

      <Animated.View entering={FadeIn.delay(200)} style={styles.footer}>
        <AppButton title={slide.cta} onPress={next} size="lg" />
      </Animated.View>
    </GradientScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    height: 52,
  },
  backSlot: {
    width: 42,
    height: 42,
  },
  main: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: Spacing.sm,
  },
  copy: {
    alignItems: 'center',
    gap: 10,
    marginTop: Spacing.lg,
  },
  subtitle: {
    maxWidth: 300,
  },
  footer: {
    paddingHorizontal: 28,
    paddingBottom: Spacing.xl,
  },
});
