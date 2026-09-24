import BaseConfig from "./config.base";
import DevConfig from "./config.dev";
import ProdConfig from "./config.prod";

// Only `EXPO_PUBLIC_`-prefixed names reach the bundle; Expo inlines them at build time, so these
// reads survive minification. Screens import `Config`, never `process.env`.
export type AppEnv = "dev" | "prod";

function resolveAppEnv(): AppEnv {
  const raw = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (raw === "dev" || raw === "prod") {
    return raw;
  }
  // An unset value in a release binary is a misconfigured build profile; defaulting that to
  // localhost would be worse than defaulting it to production.
  return __DEV__ ? "dev" : "prod";
}

const appEnv = resolveAppEnv();
const tier = appEnv === "dev" ? DevConfig : ProdConfig;
const apiOverride = process.env.EXPO_PUBLIC_SERVER_URL?.trim();

export type RecorderKind = "expo" | "fake";

function resolveRecorder(): RecorderKind {
  const raw = process.env.EXPO_PUBLIC_RECORDER?.trim().toLowerCase();
  if (raw === "expo" || raw === "fake") {
    return raw;
  }
  return tier.RECORDER;
}

const Config = {
  ...BaseConfig,
  ...tier,
  API_URL: apiOverride || tier.API_URL,
  APP_ENV: appEnv,
  RECORDER: resolveRecorder(),
} as const;

export default Config;
