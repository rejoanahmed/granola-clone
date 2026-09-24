import type { ConfigContext, ExpoConfig } from "expo/config";

// `tsx/cjs` so a config plugin can be written in TypeScript and required here without a build
// step — the line people forget when they add their first one.
// https://docs.expo.dev/config-plugins/plugins/#add-typescript-support-and-convert-to-dynamic-app-config
import "tsx/cjs";

// The dynamic half; `app.json` holds the static config, most importantly the `gcnotes` URL
// scheme. That scheme is load-bearing twice: better-auth's expo plugin signs the session cookie to
// an origin derived from it (sent as `expo-origin` by `src/lib/api.ts`), and it is the bKash return
// trip (`src/lib/bkash-checkout.ts`). Change it in one place only and every authenticated request
// silently reads as logged out. Added here because a static config cannot express it: Apple wants
// a declared reason for every required-reason API, and `expo-secure-store` reaches UserDefaults.
// https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
export default ({ config }: ConfigContext): Partial<ExpoConfig> => ({
  ...config,
  ios: {
    ...config.ios,
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
          // CA92.1 = "Access info from same app, per documentation."
          NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
        },
      ],
    },
  },
});
