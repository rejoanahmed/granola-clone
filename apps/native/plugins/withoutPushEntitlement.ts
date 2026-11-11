import { type ConfigPlugin, withEntitlementsPlist } from "expo/config-plugins";

// expo-widgets 57 writes `aps-environment` into the app's entitlements even with
// `enablePushNotifications: false` (its plugin sets the key unconditionally). The Live Activity is
// driven from the app, never by push (D037), so the key would only make EAS turn on the Push
// Notifications capability for the App ID and re-issue the profile for nothing. Applied around the
// whole config in `app.config.ts`, so it is registered before the `plugins` array; mods of one kind
// run last-registered first, so this one sees expo-widgets' result (checked by prebuild).
export const withoutPushEntitlement: ConfigPlugin = (config) =>
  withEntitlementsPlist(config, (mod) => {
    const { "aps-environment": _push, ...rest } = mod.modResults;
    mod.modResults = rest;
    return mod;
  });
