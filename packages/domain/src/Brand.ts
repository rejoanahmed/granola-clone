// The one place the product's public identity lives (D023): the display name on the home screen,
// the Expo slug, the URL scheme better-auth signs its native origin with, the bundle ids, the Worker
// name a self-hoster deploys, and the health route's `service`.
//
// The name is final (Kothanote, D030) and the store records exist, so this object is no longer a
// rename point. Two copies cannot read it and repeat its values literally: the Maestro flows'
// `appId` (YAML) and the wrangler/selfhost resource names. An installed app keeps its bundle id and
// scheme, so changing either now means a new App Store app.
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
  // The deep-link scheme. better-auth's expo plugin derives the session cookie's origin from it,
  // and the API trusts `<scheme>://`, so the server's NATIVE_SCHEME defaults to this value too.
  scheme: "kothanote",
  // The public site, a page of the publisher's own site rather than a domain of its own (D035); the
  // privacy policy lives under it at `/privacy`.
  siteUrl: "https://rovierr.com/kothanote",
  // Expo's project slug and the prefix of every self-hosted resource name (`<slug>-server`,
  // `<slug>-db`, `<slug>-audio`, …).
  slug: "kothanote",
  // Where people write to the publisher about the app: support, privacy, feedback (D035).
  supportEmail: "kothanote@rovierr.com",
} as const;

export type Brand = typeof BRAND;
