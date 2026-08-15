/**
 * Screenshot -> transaction pipeline, entirely on-device.
 *
 * Text recognition runs through Google ML Kit on Android and Apple Vision on
 * iOS. Both ship their models with the app, so scanning works offline and no
 * image or extracted text ever leaves the phone.
 */

import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { ParsedReceipt, parseReceipt } from '@/utils/receipt-parser';

interface TextExtractor {
  isSupported: boolean;
  extractTextFromImage: (uri: string) => Promise<string[]>;
}

let cachedExtractor: TextExtractor | null | undefined;

/**
 * `expo-text-extractor` resolves a native module at import time and throws when
 * it is missing — which is exactly what happens in Expo Go or in a development
 * build made before this dependency was added. Requiring it lazily keeps that
 * failure contained to the scan feature instead of taking down app startup.
 */
function getExtractor(): TextExtractor | null {
  if (cachedExtractor !== undefined) return cachedExtractor;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedExtractor = require('expo-text-extractor') as TextExtractor;
  } catch {
    cachedExtractor = null;
  }
  return cachedExtractor;
}

/** True when this build can actually run text recognition. */
export function isScanSupported(): boolean {
  if (Platform.OS === 'web') return false;
  const extractor = getExtractor();
  return Boolean(extractor?.isSupported);
}

export type ScanResult =
  | { status: 'ok'; receipt: ParsedReceipt; uri: string }
  | { status: 'no-text'; uri: string }
  | { status: 'canceled' }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

/** Runs OCR on an image already on disk and parses whatever comes back. */
export async function scanImage(uri: string): Promise<ScanResult> {
  const extractor = getExtractor();
  if (!extractor?.isSupported) return { status: 'unsupported' };

  try {
    const blocks = await extractor.extractTextFromImage(uri);
    if (!blocks || blocks.length === 0) return { status: 'no-text', uri };

    const receipt = parseReceipt(blocks);
    // Without an amount there is nothing worth prefilling.
    if (receipt.amount === undefined) return { status: 'no-text', uri };

    return { status: 'ok', receipt, uri };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not read that image.',
    };
  }
}

/** Opens the photo library, then scans whatever the user picked. */
export async function pickAndScan(): Promise<ScanResult> {
  if (!isScanSupported()) return { status: 'unsupported' };

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
  });

  if (result.canceled || !result.assets?.length) return { status: 'canceled' };

  return scanImage(result.assets[0].uri);
}

/** Same as {@link pickAndScan} but sourced from the camera. */
export async function captureAndScan(): Promise<ScanResult> {
  if (!isScanSupported()) return { status: 'unsupported' };

  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const result = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (result.canceled || !result.assets?.length) return { status: 'canceled' };

  return scanImage(result.assets[0].uri);
}

/** Copy shown to the user when a scan does not produce a transaction. */
export function describeScanFailure(result: ScanResult): string {
  switch (result.status) {
    case 'no-text':
      return "Couldn't find a payment amount in that image. Try a full, uncropped screenshot of the receipt.";
    case 'denied':
      return 'Mercury needs access to your photos to read a payment screenshot.';
    case 'unsupported':
      return 'Screenshot scanning needs a development build of Mercury — it is unavailable here.';
    case 'error':
      return result.message;
    default:
      return 'Scan cancelled.';
  }
}
