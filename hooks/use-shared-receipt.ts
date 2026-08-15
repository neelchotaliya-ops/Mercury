import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';

/**
 * Sends a screenshot shared into Mercury from another app straight to the
 * add-transaction screen, which runs OCR on it and prefills the form.
 *
 * @param enabled Hold routing until the navigator and stored data are ready.
 */
export function useSharedReceipt(enabled: boolean): void {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const handledPath = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !hasShareIntent) return;

    const image = shareIntent.files?.find(file => file.mimeType?.startsWith('image/'));
    if (!image) {
      // Text or a link — nothing Mercury can turn into a transaction.
      resetShareIntent();
      return;
    }

    // Re-entering the app can replay the same intent; only act on it once.
    if (handledPath.current === image.path) return;
    handledPath.current = image.path;

    router.push({ pathname: '/add-transaction', params: { imageUri: image.path } });
    resetShareIntent();
  }, [enabled, hasShareIntent, shareIntent, resetShareIntent, router]);
}
