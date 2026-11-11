import type { ConfigContext, ExpoConfig } from "expo/config";

// `tsx/cjs` so a config plugin can be written in TypeScript and required here without a build
// step — the line people forget when they add their first one.
// https://docs.expo.dev/config-plugins/plugins/#add-typescript-support-and-convert-to-dynamic-app-config
import "tsx/cjs";
// Relative, not `@kn/domain/Brand`: this file runs under node at build time, where the workspace's
// TypeScript path aliases do not resolve. The one rename point (D023).
import { BRAND } from "../../packages/domain/src/Brand";
import { withoutPushEntitlement } from "./plugins/withoutPushEntitlement";

// The dynamic half; `app.json` holds the static config, most importantly the `kothanote` URL
// scheme. That scheme is load-bearing twice: better-auth's expo plugin signs the session cookie to
// an origin derived from it (sent as `expo-origin` by `src/lib/api.ts`), and it is the OAuth return
// trip back into the app. Change it in one place only and every authenticated request
// silently reads as logged out. Added here because a static config cannot express it: Apple wants
// a declared reason for every required-reason API, and `expo-secure-store` reaches UserDefaults.
// https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
//
// The name, slug, scheme and bundle id come from `BRAND`, so `app.json`'s copies are only what a
// tool that reads the static file sees; the values here win.
const MICROPHONE_PERMISSION = `${BRAND.displayName} needs microphone access to transcribe your meeting`;

// The Live Activity's widget extension (D037). Its own bundle id, under the app's so EAS's remote
// credentials create its provisioning profile on the same team, and an App Group the app and the
// extension share (expo-widgets passes the activity's layout through it).
const LIVE_ACTIVITY = {
  bundleIdentifier: `${BRAND.bundleId}.LiveActivity`,
  groupIdentifier: `group.${BRAND.bundleId}`,
};

const withBrandedPlugins = (
  plugins: ExpoConfig["plugins"]
): ExpoConfig["plugins"] =>
  plugins?.map((plugin) => {
    if (!Array.isArray(plugin)) {
      return plugin;
    }
    if (plugin[0] === "expo-audio") {
      return [
        "expo-audio",
        { ...plugin[1], microphonePermission: MICROPHONE_PERMISSION },
      ];
    }
    if (plugin[0] === "expo-widgets") {
      return ["expo-widgets", { ...plugin[1], ...LIVE_ACTIVITY }];
    }
    return plugin;
  });

// Wrapped in `withoutPushEntitlement` rather than listed in `plugins`: a config plugin applied here
// registers its mod before the `plugins` array's, and a mod registered first runs last, after
// expo-widgets has written the key it removes.
export default ({ config }: ConfigContext): Partial<ExpoConfig> =>
  withoutPushEntitlement({
    ...config,
    android: {
      ...config.android,
      package: BRAND.androidPackage,
    },
    ios: {
      ...config.ios,
      bundleIdentifier: BRAND.bundleId,
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          {
            NSPrivacyAccessedAPIType:
              "NSPrivacyAccessedAPICategoryUserDefaults",
            // CA92.1 = "Access info from same app, per documentation."
            NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
          },
        ],
      },
    },
    name: BRAND.displayName,
    plugins: withBrandedPlugins(config.plugins),
    scheme: BRAND.scheme,
    slug: BRAND.slug,
  } as ExpoConfig);
