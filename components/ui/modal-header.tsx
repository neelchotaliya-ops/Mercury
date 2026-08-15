import React from 'react';
import { View, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { Colors } from '@/constants/theme';

export interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onDelete?: () => void;
  closeIcon?: 'close' | 'arrow-back';
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  subtitle,
  onClose,
  onDelete,
  closeIcon = 'close',
}) => (
  <View style={styles.header}>
    <IconButton iconName={closeIcon} onPress={onClose} size={42} />

    <View style={styles.titleCol}>
      <AppText variant="h3" align="center" numberOfLines={1}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="micro" align="center">
          {subtitle}
        </AppText>
      ) : null}
    </View>

    {onDelete ? (
      <IconButton iconName="trash-outline" onPress={onDelete} size={42} color={Colors.expense} />
    ) : (
      <View style={styles.spacer} />
    )}
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
    gap: 12,
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  spacer: {
    width: 42,
  },
});
