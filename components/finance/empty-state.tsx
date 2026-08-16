import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppText } from '@/components/ui/app-text';
import { AppButton, ButtonVariant } from '@/components/ui/app-button';
import { Colors } from '@/constants/theme';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  actionVariant?: ButtonVariant;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  subtitle,
  actionLabel,
  actionVariant = 'primary',
  onAction,
}) => (
  <View style={styles.container}>
    <View style={styles.iconWrap}>
      <Ionicons name={icon} size={26} color={Colors.primary} />
    </View>
    <AppText variant="h3" align="center">
      {title}
    </AppText>
    {subtitle ? (
      <AppText variant="caption" align="center" style={styles.subtitle}>
        {subtitle}
      </AppText>
    ) : null}
    {actionLabel && onAction ? (
      <AppButton
        title={actionLabel}
        onPress={onAction}
        variant={actionVariant}
        size="sm"
        fullWidth={false}
        style={styles.action}
      />
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 26,
    paddingHorizontal: 12,
    gap: 6,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  subtitle: {
    maxWidth: 250,
  },
  action: {
    marginTop: 16,
    paddingHorizontal: 22,
  },
});
