import { afterEach, describe, expect, it, vi } from "vitest";

// The module under test calls `SplashScreen.preventAutoHideAsync()` at import and builds the auth
// client; neither can load on node, and neither is what these guards decide.
vi.mock("expo-router", () => ({
  SplashScreen: { hideAsync: vi.fn(), preventAutoHideAsync: vi.fn() },
  useGlobalSearchParams: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(),
  useSegments: vi.fn(),
}));
vi.mock("@native/lib/auth-client", () => ({ authClient: {} }));

const { isPublicNativeRoute, sanitizeReturnPath } = await import(
  "./auth-provider"
);

const globals = globalThis as { __DEV__?: boolean };
const originalDev = globals.__DEV__;

const withDev = (value: boolean) => {
  globals.__DEV__ = value;
};

afterEach(() => {
  globals.__DEV__ = originalDev;
});

// AC7 (docs/spec/phase-2.md §8): the dev routes are public only in a development build, and no
// returnTo can ever land on one.
describe("dev routes", () => {
  it("treats /dev/* as public in a development build", () => {
    withDev(true);
    expect(isPublicNativeRoute(["dev", "home"])).toBe(true);
    expect(isPublicNativeRoute(["dev", "gallery"])).toBe(true);
  });

  it("does not treat /dev/* as public in a Release build", () => {
    withDev(false);
    expect(isPublicNativeRoute(["dev", "home"])).toBe(false);
    expect(isPublicNativeRoute(["dev", "gallery"])).toBe(false);
  });

  it("never lets a returnTo land on /dev/*, in either build", () => {
    for (const dev of [true, false]) {
      withDev(dev);
      expect(sanitizeReturnPath("/dev/gallery")).toBe("/");
      expect(sanitizeReturnPath("/dev/home?x=1")).toBe("/");
    }
  });

  it("keeps welcome public and home private whatever the build", () => {
    for (const dev of [true, false]) {
      withDev(dev);
      expect(isPublicNativeRoute(["screens", "welcome"])).toBe(true);
      expect(isPublicNativeRoute([])).toBe(false);
    }
  });
});

// AC9 (docs/spec/phase-3.md §8): onboarding and settings are private, a returnTo may land on
// settings, and none may land inside onboarding — that would let a link skip or re-enter it.
describe("phase-3 routes", () => {
  it("keeps onboarding and settings private in either build", () => {
    for (const dev of [true, false]) {
      withDev(dev);
      expect(isPublicNativeRoute(["onboarding", "name"])).toBe(false);
      expect(isPublicNativeRoute(["onboarding", "about"])).toBe(false);
      expect(isPublicNativeRoute(["settings"])).toBe(false);
    }
  });

  it("lets a returnTo land on /settings", () => {
    expect(sanitizeReturnPath("/settings")).toBe("/settings");
  });

  it("never lets a returnTo land inside onboarding", () => {
    for (const path of [
      "/onboarding/name",
      "/onboarding/about",
      "/onboarding/ready",
    ]) {
      expect(sanitizeReturnPath(path)).toBe("/");
    }
  });
});
