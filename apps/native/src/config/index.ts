import BaseConfig from "./config.base";
import DevConfig from "./config.dev";
import ProdConfig from "./config.prod";

// Only `EXPO_PUBLIC_`-prefixed names reach the bundle; Expo inlines them at build time, so these
// reads survive minification. Screens import `Config`, never `process.env`.
//
// The three values are the publisher's other app's (eas.json, D031): `local` is a development build
// against the API on this machine; `dev` is an internal (preview) build and `prod` the store build,
// and both start with no server, because every user brings their own (D019).
export type AppEnv = "local" | "dev" | "prod";

function resolveAppEnv(): AppEnv {
  const raw = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (raw === "local" || raw === "dev" || raw === "prod") {
    return raw;
  }
  // An unset value in a release binary is a misconfigured build profile; defaulting that to
  // localhost would be worse than defaulting it to production.
  return __DEV__ ? "local" : "prod";
}

const appEnv = resolveAppEnv();
const tier = appEnv === "local" ? DevConfig : ProdConfig;
const apiOverride = process.env.EXPO_PUBLIC_SERVER_URL?.trim();

export type RecorderKind = "expo" | "fake";

function resolveRecorder(): RecorderKind {
  const raw = process.env.EXPO_PUBLIC_RECORDER?.trim().toLowerCase();
  if (raw === "expo" || raw === "fake") {
    return raw;
  }
  return tier.RECORDER;
}

// Entry points to features that do not exist yet (a desktop app, phone calls, Watch, a
// subscription, attachments, a calendar connection, dictation) are hidden unless a build asks for
// them (D027): App Review rejects dead ends and placeholders, and the code stays for the phase that
// finishes each one. `EXPO_PUBLIC_SHOW_UNFINISHED=true` brings them back for development and for
// the Maestro flows tagged `unfinished`.
const showUnfinished =
  process.env.EXPO_PUBLIC_SHOW_UNFINISHED?.trim().toLowerCase() === "true";

const Config = {
  ...BaseConfig,
  ...tier,
  API_URL: apiOverride || tier.API_URL,
  APP_ENV: appEnv,
  RECORDER: resolveRecorder(),
  SHOW_UNFINISHED: showUnfinished,
} as const;

export default Config;
