import Constants from "expo-constants";

// "1.0.0 (1)", as #81's footer reads, and the `appVersion` a bug report carries. The build number is
// app.json's `ios.buildNumber`, read through expo-constants rather than expo-application, which
// would be a native dependency (and a rebuild) for one string. The "?" fallback is visible on
// purpose: a missing value should look wrong, not like build 0.
export const VERSION = `${Constants.expoConfig?.version ?? "?"} (${
  Constants.expoConfig?.ios?.buildNumber ?? "?"
})`;
