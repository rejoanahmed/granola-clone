import { describe, expect, it } from "vitest";
import { gateFor } from "./gate";

// §7 case 28 (docs/spec/phase-3.md §1.5): the three gates, as a pure function of what the app
// knows — so the redirect rules are tested here and `useProtectedRoute` only performs them.

const session = { user: { email: "rita@example.test", id: "usr_1", name: "" } };
const notOnboarded = { onboardedAt: null };
const onboarded = { onboardedAt: 1_700_000_000_000 };

const HOME: string[] = [];
const WELCOME = ["screens", "welcome"];
const SETTINGS = ["settings"];
const ONBOARDING_NAME = ["onboarding", "name"];
const ONBOARDING_ABOUT = ["onboarding", "about"];

describe("gateFor, signed out", () => {
  it("sends a private route to welcome", () => {
    for (const segments of [HOME, SETTINGS, ONBOARDING_NAME]) {
      expect(gateFor({ profile: null, segments, session: null })).toBe(
        "welcome"
      );
    }
  });

  it("stays on welcome", () => {
    expect(gateFor({ profile: null, segments: WELCOME, session: null })).toBe(
      "stay"
    );
  });
});

describe("gateFor, signed in and not onboarded", () => {
  it("sends every non-onboarding route to onboarding, welcome included", () => {
    for (const segments of [HOME, SETTINGS, WELCOME]) {
      expect(gateFor({ profile: notOnboarded, segments, session })).toBe(
        "onboarding"
      );
    }
  });

  it("stays anywhere inside onboarding", () => {
    for (const segments of [ONBOARDING_NAME, ONBOARDING_ABOUT]) {
      expect(gateFor({ profile: notOnboarded, segments, session })).toBe(
        "stay"
      );
    }
  });
});

describe("gateFor, signed in and onboarded", () => {
  it("sends welcome and onboarding home, so onboarding is never shown twice", () => {
    for (const segments of [WELCOME, ONBOARDING_NAME, ONBOARDING_ABOUT]) {
      expect(gateFor({ profile: onboarded, segments, session })).toBe("home");
    }
  });

  it("stays on home and on settings", () => {
    for (const segments of [HOME, SETTINGS]) {
      expect(gateFor({ profile: onboarded, segments, session })).toBe("stay");
    }
  });
});
