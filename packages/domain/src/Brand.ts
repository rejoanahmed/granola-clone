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
  // The iOS bundle identifier. Changing it after the first App Store upload creates a new app.
  bundleId: "com.rejoan.gcnotes",
  // What the home screen and the system dialogs call the app.
  displayName: "Notes",
  // The deep-link scheme. better-auth's expo plugin derives the session cookie's origin from it,
  // and the API trusts `<scheme>://`, so the server's NATIVE_SCHEME defaults to this value too.
  scheme: "gcnotes",
  // Expo's project slug and the prefix of every self-hosted resource name (`<slug>-server`,
  // `<slug>-db`, `<slug>-audio`, …).
  slug: "gcnotes",
} as const;

export type Brand = typeof BRAND;
