'use no memo';
// Must stay the file's literal first line — see quick-log-widget.tsx for why.

import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { IconWidget, type HexColor } from 'react-native-android-widget';

export interface WidgetGlyphProps {
  name: keyof typeof Ionicons.glyphMap;
  size: number;
  color: HexColor;
}

/**
 * Renders an Ionicons glyph inside a widget via the icon font directly —
 * `<Ionicons>` itself is a normal RN component and cannot appear in a widget
 * tree, but its `glyphMap` is just a plain name-to-codepoint lookup, safe to
 * read anywhere. The font file is registered with the widget config plugin in
 * app.json (`fonts: [...]`), copied to the app's asset font family "Ionicons"
 * by the plugin at prebuild time.
 */
export function WidgetGlyph({ name, size, color }: WidgetGlyphProps) {
  'use no memo';
  const glyph = Ionicons.glyphMap[name];
  const icon = typeof glyph === 'number' ? String.fromCodePoint(glyph) : glyph;
  return <IconWidget font="Ionicons" icon={icon} size={size} style={{ color }} />;
}
