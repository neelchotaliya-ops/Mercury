/**
 * Screenshot -> transaction pipeline, entirely on-device.
 *
 * Text recognition runs through Google ML Kit on Android and Apple Vision on
 * iOS. Both ship their models with the app, so scanning works offline and no
 * image or extracted text ever leaves the phone.
 */

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as ImagePicker from 'expo-image-picker';

import { ParsedReceipt, parseReceipt } from '@/utils/receipt-parser';

interface NativeTextExtractor {
  isSupported: boolean;
  extractTextFromImage: (uri: string) => Promise<string[]>;
}

/**
 * Bind the native module directly instead of importing `expo-text-extractor`.
 *
 * That package calls `requireNativeModule` at module scope, which throws the
 * moment it is imported without a matching native build — Expo Go, or a dev
 * build made before this dependency was added. Metro surfaces that as a render
 * error, so wrapping the import in try/catch does not contain it. The optional
 * variant returns null instead of throwing, so the app keeps working and only
 * the scan feature switches itself off.
 *
 * `expo-text-extractor` must stay in package.json even though nothing imports
 * it: autolinking is what ships the native code this looks up. Removing it as
 * an "unused dependency" silently disables scanning in every build.
 */
const TextExtractor = requireOptionalNativeModule<NativeTextExtractor>('ExpoTextExtractor');

/** True when this build can actually run text recognition. */
export function isScanSupported(): boolean {
  if (Platform.OS === 'web') return false;
  return Boolean(TextExtractor?.isSupported);
}

/** Mirrors the wrapper `expo-text-extractor` applies before its native call. */
async function extractText(uri: string): Promise<string[]> {
  if (!TextExtractor) return [];
  return TextExtractor.extractTextFromImage(uri.replace('file://', ''));
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
  if (!isScanSupported()) return { status: 'unsupported' };

  try {
    const blocks = await extractText(uri);
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
