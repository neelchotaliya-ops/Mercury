import React from 'react';
import { View, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { useAppTheme } from '@/context/theme-context';

export interface ModalHeaderProps {
  title: string;
  onClose: () => void;
  onDelete?: () => void;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({ title, onClose, onDelete }) => {
  const { colors } = useAppTheme();

  return (
    <View style={styles.header}>
      <IconButton iconName="close" onPress={onClose} size={40} iconSize={18} />
      <AppText variant="h3" style={{ color: colors.textPrimary }}>
        {title}
      </AppText>
      {onDelete ? (
        <IconButton iconName="trash-outline" onPress={onDelete} size={40} iconSize={18} color="#DC2626" />
      ) : (
        <View style={{ width: 40 }} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
});
