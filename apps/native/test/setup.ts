// Mocks for the native modules that have no JS implementation in a node process, loaded before
// any gcnotes module. They live here, not in individual tests, because the failure they prevent is
// an import-time crash: `src/lib/auth-client.ts` constructs the auth client at module scope, so any
// test transitively importing a screen dies on SecureStore before its first assertion.
// `react-native` is extended rather than replaced, so everything unlisted keeps real behaviour.
import { jest } from "@jest/globals";
import * as ReactNative from "react-native";

jest.doMock("react-native", () =>
  Object.setPrototypeOf(
    {
      Image: {
        ...ReactNative.Image,
        getSize: jest.fn(
          (
            _uri: string,
            success: (width: number, height: number) => void
          ): void => success(100, 100)
        ),
      },
    },
    ReactNative
  )
);

/** Keychain / KeyStore. The auth client reads it at module scope. */
jest.mock("expo-secure-store", () => ({
  deleteItemAsync: jest.fn(async () => undefined),
  getItem: jest.fn(() => null),
  getItemAsync: jest.fn(async () => null),
  setItem: jest.fn(() => undefined),
  setItemAsync: jest.fn(async () => undefined),
}));

/** `createURL` is what `expoOrigin()` calls; it needs the native linking constants. */
jest.mock("expo-linking", () => ({
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  createURL: (path: string) => `gcnotes://${path}`,
  useURL: () => null,
}));

/** The OAuth hand-off. Returning "dismiss" is the "user came back" path. */
jest.mock("expo-web-browser", () => ({
  dismissBrowser: jest.fn(async () => undefined),
  openBrowserAsync: jest.fn(async () => ({ type: "dismiss" })),
}));

/** The splash hold in `lib/auth-provider.tsx`. Both calls are fire-and-forget promises. */
jest.mock("expo-splash-screen", () => ({
  hideAsync: jest.fn(async () => undefined),
  preventAutoHideAsync: jest.fn(async () => undefined),
}));
