// The one place the product's public identity lives (D023). The app is going public under a name
// that is not chosen yet, so everything a rename touches reads from here: the display name on the
// home screen, the Expo slug, the URL scheme better-auth signs its native origin with, the iOS
// bundle id, the Worker name a self-hoster deploys, and the health route's `service`.
//
// Renaming is editing this object. Two things it cannot reach, by design:
// - `apps/native/.maestro/**` names `appId` literally (Maestro reads YAML, not TypeScript), and
//   `scripts/rename-brand.sh` rewrites those after the edit;
// - an installed app keeps its old scheme and bundle id: a new bundle id is a new App Store app.
//   So the rename must land before the first public build, not after.
//
// Plain data, no imports: `apps/native/app.config.ts` loads this file through `tsx` at build time,
// where no workspace alias resolves.
export const BRAND = {
  // The Android application id, in the pattern of the publisher's other app (`com.<brand>.app`, D030).
  androidPackage: "com.kothanote.app",
  // The iOS bundle identifier, in the publisher's pattern (`com.rovierr.<slug>`). Changing it after
  // the first App Store upload creates a new app.
  bundleId: "com.rovierr.kothanote",
  // What the home screen and the system dialogs call the app. Chosen 2026-11-11 (D030).
  displayName: "Kothanote",
  // The public site and the address the privacy policy lives at.
  domain: "kothanote.app",
  // The deep-link scheme. better-auth's expo plugin derives the session cookie's origin from it,
  // and the API trusts `<scheme>://`, so the server's NATIVE_SCHEME defaults to this value too.
  scheme: "kothanote",
  // Expo's project slug and the prefix of every self-hosted resource name (`<slug>-server`,
  // `<slug>-db`, `<slug>-audio`, …).
  slug: "kothanote",
} as const;

export type Brand = typeof BRAND;
