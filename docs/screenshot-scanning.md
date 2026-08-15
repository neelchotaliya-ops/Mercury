# Screenshot scanning

> Home screen widgets are documented separately in
> [`docs/home-screen-widgets.md`](./home-screen-widgets.md).


Mercury can read a payment screenshot (Google Pay, PhonePe, Paytm, or any UPI
receipt) and prefill a transaction from it.

Everything runs on the device. Text recognition uses **Google ML Kit** on
Android and **Apple Vision** on iOS — both ship their models inside the app, so
scanning works with no network connection. No image and no extracted text is
ever uploaded, and no AI service is called.

## How a user reaches it

1. **Share sheet** — from Google Pay (or Photos), share a screenshot and pick
   Mercury. The app opens straight into a prefilled *New transaction* screen.
2. **In-app** — on the *New transaction* screen, tap **Scan a payment
   screenshot** to pick from the gallery, or the camera button for a paper
   receipt.

Either way the transaction is **never saved automatically**. Fields are filled
in and the user confirms with *Add transaction*, so a misread can always be
corrected first. A banner reports what was read, and warns explicitly when only
part of the receipt was legible.

## What gets extracted

| Field | Source |
| --- | --- |
| Amount | Largest currency-marked value, scored by position and isolation |
| Expense / income | "Paid to" / "Received from" style markers |
| Merchant | Name on or after the marker line |
| Date | `15 Aug 2026`, `Aug 15, 2026`, `15/08/2026`, ISO, or "Yesterday" |
| Category | Merchant keyword table (Swiggy → Food & Dining, Uber → Transport, …) |
| Account | Bank hint matched against your account names and card tails |
| Note | Merchant plus the UPI reference number |

Anything unreadable is left blank rather than guessed.

## Code layout

| File | Role |
| --- | --- |
| `utils/receipt-parser.ts` | Pure text → fields. No React, no I/O, fully testable. |
| `utils/receipt-match.ts` | Merchant → category and bank hint → account. |
| `utils/receipt-scan.ts` | OCR + image picker orchestration and failure copy. |
| `hooks/use-shared-receipt.ts` | Routes a shared screenshot into the form. |
| `components/finance/scan-receipt-button.tsx` | The scan entry tile. |

Run the parser checks after changing any heuristic:

```bash
npm run test:parser
```

## Build requirements

Text recognition and the share sheet are native, so **Expo Go cannot run this
feature** — you need a development build:

```bash
npx expo prebuild --no-install --clean
npx expo run:android    # or: npx expo run:ios
```

The app still runs everywhere else; `isScanSupported()` returns `false` on web
and in Expo Go, and the scan tile is simply hidden.

### iOS: `patch-package` is required

`expo-share-intent` needs a patch to `xcode@3.0.1` or `expo prebuild` fails with
`Config sync failed … withIosXcodeprojBaseMod: Cannot read properties of null`.
Before prebuilding for iOS:

1. Copy `xcode+3.0.1.patch` from the
   [expo-share-intent example patches](https://github.com/achorein/expo-share-intent/tree/main/example/basic/patches)
   into a `patches/` directory at the project root.
2. `npm install --save-dev patch-package`
3. Add `"postinstall": "patch-package"` to `package.json` scripts.

Android needs no patch.

### Permissions

Declared via config plugins in `app.json`: photo library and camera access for
the picker, and an `image/*` share target so Mercury appears in the share sheet.

## Currency

The parser reads the number, not the currency — the amount is recorded in
whatever currency the app is set to in Settings. Converting would require live
rates, which would mean a network call, so it is deliberately not done.
