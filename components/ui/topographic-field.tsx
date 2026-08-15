import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { BLOB_PATH, BLOB_PATH_ALT, BLOB_VIEWBOX } from '@/constants/shapes';

export interface TopographicFieldProps {
  size?: number;
  /** Number of nested contour lines. */
  rings?: number;
  /** Rotation of the whole field, in degrees. */
  rotate?: number;
  style?: ViewStyle;
  warm?: boolean;
}

const CENTER = BLOB_VIEWBOX / 2;

/**
 * Nested organic contour lines, like a topographic map. Each ring is the
 * shared blob path scaled about its centre, alternating between two lobe
 * variants and drifting in rotation so the set reads as hand-drawn contours
 * rather than concentric copies.
 */
export const TopographicField: React.FC<TopographicFieldProps> = ({
  size = 460,
  rings = 7,
  rotate = 0,
  style,
  warm = false,
}) => {
  const stroke = warm ? Colors.contourWarm : Colors.contour;

  return (
    <View pointerEvents="none" style={[styles.container, { width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${BLOB_VIEWBOX} ${BLOB_VIEWBOX}`}>
        <G transform={`rotate(${rotate} ${CENTER} ${CENTER})`}>
          {Array.from({ length: rings }).map((_, index) => {
            // Rings get closer together toward the outside, like real contours.
            const t = (index + 1) / rings;
            const scale = 0.26 + t * 0.74;
            const drift = index * 5;

            return (
              <Path
                key={index}
                d={index % 2 === 0 ? BLOB_PATH : BLOB_PATH_ALT}
                fill="none"
                stroke={stroke}
                strokeWidth={1 / scale}
                transform={`rotate(${drift} ${CENTER} ${CENTER}) translate(${CENTER}, ${CENTER}) scale(${scale}) translate(${-CENTER}, ${-CENTER})`}
              />
            );
          })}
        </G>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
  },
});
