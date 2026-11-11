import { BRAND } from "@kn/domain/Brand";
import type { ServerInfo } from "@kn/domain/Domain/Server";
import Config from "@native/config";
import * as SecureStore from "expo-secure-store";
import * as Updates from "expo-updates";
import { DevSettings } from "react-native";

// Which server this phone talks to (D019). Every user runs their own, so the address is chosen at
// first run and kept in the Keychain, not baked into the build. It is read synchronously at module
// scope: the auth client and the API client are module singletons built from it, so choosing a
// server ends in a reload rather than in rebuilding them under a mounted tree.

const SERVER_KEY = `${BRAND.slug}-server-v1`;

export type StoredServer = { readonly info: ServerInfo; readonly url: string };

const read = (): StoredServer | null => {
  try {
    const raw = SecureStore.getItem(SERVER_KEY);
    if (raw === null || raw === "") {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredServer;
    return typeof parsed?.url === "string" ? parsed : null;
  } catch {
    return null;
  }
};

const stored = read();

/**
 * The server the clients were built for: the one chosen at first run, else the build's own
 * (`EXPO_PUBLIC_SERVER_URL`, or localhost in a development build). A store build has none, which
 * is what sends a fresh install to the connect screen.
 */
export const SERVER_URL: string | null =
  stored?.url ?? (Config.API_URL || null);

/** What the chosen server said about itself at connect time; null for a build's own server. */
export const SERVER_INFO: ServerInfo | null = stored?.info ?? null;

export const hasServer = (): boolean => SERVER_URL !== null;

/** True when this server signs its one owner in by token rather than by email code. */
export const isOwnerServer = (): boolean => SERVER_INFO?.auth === "owner";

/** Whether the server can send mail: when it cannot, support goes through the phone's mail app. */
export const serverSendsEmail = (): boolean => SERVER_INFO?.email ?? true;

export const saveServer = (server: StoredServer): void => {
  SecureStore.setItem(SERVER_KEY, JSON.stringify(server));
};

export const forgetServer = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(SERVER_KEY).catch(() => undefined);
};

// A release build reloads through expo-updates; a development build has no update to reload and
// uses the dev menu's reload. Either way the module singletons are rebuilt from the new server.
export const reloadApp = async (): Promise<void> => {
  try {
    await Updates.reloadAsync();
  } catch {
    DevSettings.reload();
  }
};
