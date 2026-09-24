import { describe, expect, it } from "vitest";
// @ts-expect-error phase 3: ProfilePatch and UserType are specified (phase-3.md §6.2), not built
import { ProfilePatch, UserType } from "./Profile";

// The patch is the only thing between a phone's form and the `profiles` row, so every rule the
// service relies on — "" clears, an unknown key is refused — is the contract's, and lives here.

const USER_TYPES = [
  "investing",
  "recruiting",
  "customer_facing",
  "startup_generalist",
  "other",
];

describe("ProfilePatch", () => {
  it("is exported, alongside UserType", () => {
    expect(ProfilePatch).toBeDefined();
    expect(UserType).toBeDefined();
  });

  it("trims what it keeps", () => {
    expect(
      ProfilePatch.parse({ companyName: "  Acme  ", jobTitle: " Designer" })
    ).toEqual({ companyName: "Acme", jobTitle: "Designer" });
  });

  it("turns an empty or whitespace-only field into null, so a cleared field clears", () => {
    expect(
      ProfilePatch.parse({
        companyDescription: "",
        companyName: "   ",
        jobTitle: "",
        linkedinUsername: "",
      })
    ).toEqual({
      companyDescription: null,
      companyName: null,
      jobTitle: null,
      linkedinUsername: null,
    });
  });

  it("leaves an absent key absent, so PATCH changes only what was sent", () => {
    expect(ProfilePatch.parse({})).toEqual({});
    expect(ProfilePatch.parse({ jobTitle: null })).toEqual({ jobTitle: null });
  });

  it("accepts every user type, and null", () => {
    for (const userType of USER_TYPES) {
      expect(ProfilePatch.parse({ userType })).toEqual({ userType });
    }
    expect(ProfilePatch.parse({ userType: null })).toEqual({ userType: null });
    expect(UserType.options).toEqual(USER_TYPES);
  });

  it("refuses an unknown user type", () => {
    expect(ProfilePatch.safeParse({ userType: "astronaut" }).success).toBe(
      false
    );
  });

  it("refuses a key it does not own, so a client sending name learns it went nowhere", () => {
    expect(ProfilePatch.safeParse({ name: "Rita" }).success).toBe(false);
    expect(ProfilePatch.safeParse({ email: "a@b.test" }).success).toBe(false);
  });

  it("holds each field to its length limit", () => {
    expect(
      ProfilePatch.safeParse({ companyName: "x".repeat(100) }).success
    ).toBe(true);
    expect(
      ProfilePatch.safeParse({ companyName: "x".repeat(101) }).success
    ).toBe(false);
    expect(ProfilePatch.safeParse({ jobTitle: "x".repeat(101) }).success).toBe(
      false
    );
    expect(
      ProfilePatch.safeParse({ companyDescription: "x".repeat(1001) }).success
    ).toBe(false);
  });

  it("holds a LinkedIn username to letters, digits and dashes, 3 to 100 long", () => {
    expect(
      ProfilePatch.safeParse({ linkedinUsername: "rita-newcomer" }).success
    ).toBe(true);
    expect(ProfilePatch.safeParse({ linkedinUsername: "a b" }).success).toBe(
      false
    );
    expect(ProfilePatch.safeParse({ linkedinUsername: "ab" }).success).toBe(
      false
    );
  });
});
