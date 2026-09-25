import { describe, expect, it } from "vitest";
// @ts-expect-error phase 7: the person key is specified (phase-7.md §6.2, §11 API 1), not built
import * as Person from "./Person";

// docs/spec/phase-7.md §6.2 and §7 case 22. A person is not a row: they are whoever appears as an
// attendee, keyed by their email when they have one. Person-scoped Ask uses the key today and
// phase 8's person page builds on it, so the normalisation must be one function both call.

describe("personKeyOf", () => {
  it("keys by the email, trimmed and lowercased", () => {
    expect(
      Person.personKeyOf({ email: "  Priya@Example.COM ", name: "Priya Raman" })
    ).toBe("email:priya@example.com");
  });

  it("prefers the email to the name", () => {
    expect(
      Person.personKeyOf({ email: "sam@example.com", name: "Sam Okafor" })
    ).toBe("email:sam@example.com");
  });

  it("falls back to the name, trimmed, lowercased and whitespace-collapsed", () => {
    expect(Person.personKeyOf({ email: null, name: "  Sam \t  Okafor " })).toBe(
      "name:sam okafor"
    );
  });

  it("treats a blank email as no email", () => {
    expect(Person.personKeyOf({ email: "   ", name: "Sam Okafor" })).toBe(
      "name:sam okafor"
    );
  });
});

describe("PersonKey", () => {
  it("accepts an email key and a name key", () => {
    expect(Person.PersonKey.safeParse("email:priya@example.com").success).toBe(
      true
    );
    expect(Person.PersonKey.safeParse("name:sam okafor").success).toBe(true);
  });

  it("refuses a key with no kind, an unknown kind, or nothing after the colon", () => {
    expect(Person.PersonKey.safeParse("priya@example.com").success).toBe(false);
    expect(Person.PersonKey.safeParse("phone:+15550100").success).toBe(false);
    expect(Person.PersonKey.safeParse("email:").success).toBe(false);
  });

  it("refuses a key over 260 characters", () => {
    expect(Person.PersonKey.safeParse(`name:${"a".repeat(256)}`).success).toBe(
      false
    );
  });
});
