import { describe, expect, it } from "vitest";
import {
  AttendeeInput,
  Note,
  NoteCreate,
  NotePatch,
  NoteSummary,
  NoteTitle,
} from "./Note";

// The contract is the only thing between a phone's form and the `notes` row, so the rules the
// service leans on — a title is never blank, a body never names its owner — are the schema's.

describe("NoteTitle", () => {
  it("trims what it keeps", () => {
    expect(NoteTitle.parse("  Weekly standup  ")).toBe("Weekly standup");
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["over 200 characters", "x".repeat(201)],
  ])("rejects a title that is %s", (_what, title) => {
    expect(NoteTitle.safeParse(title).success).toBe(false);
  });

  it("accepts exactly 200 characters", () => {
    expect(NoteTitle.safeParse("x".repeat(200)).success).toBe(true);
  });
});

describe("NoteCreate", () => {
  it("accepts an empty body, because every field has a server default", () => {
    expect(NoteCreate.parse({})).toEqual({});
  });

  it("rejects a key it does not own, so a body cannot name an owner", () => {
    expect(NoteCreate.safeParse({ ownerId: "usr_person_0002" }).success).toBe(
      false
    );
  });

  it("caps the attendees at fifty", () => {
    const attendees = Array.from({ length: 51 }, (_, index) => ({
      name: `Guest ${index}`,
    }));

    expect(NoteCreate.safeParse({ attendees }).success).toBe(false);
  });
});

describe("NotePatch", () => {
  it("leaves an absent key absent, so PATCH changes only what was sent", () => {
    expect(NotePatch.parse({})).toEqual({});
    expect(NotePatch.parse({ title: " New " })).toEqual({ title: "New" });
  });

  it("rejects a key it does not own", () => {
    expect(NotePatch.safeParse({ trashedAt: null }).success).toBe(false);
  });

  it("refuses a body over 100 000 characters", () => {
    expect(
      NotePatch.safeParse({ bodyMarkdown: "x".repeat(100_001) }).success
    ).toBe(false);
  });
});

describe("AttendeeInput", () => {
  it("requires a name or an email", () => {
    expect(AttendeeInput.safeParse({}).success).toBe(false);
  });

  it.each([
    ["a name alone", { name: "Priya Raman" }],
    ["an email alone", { email: "priya@example.com" }],
    ["both", { email: "priya@example.com", name: "Priya Raman" }],
  ])("accepts %s", (_what, input) => {
    expect(AttendeeInput.safeParse(input).success).toBe(true);
  });

  it("rejects an address that is not one, and an unknown key", () => {
    expect(AttendeeInput.safeParse({ email: "not-an-email" }).success).toBe(
      false
    );
    expect(
      AttendeeInput.safeParse({ name: "Priya", userId: "usr_1" }).success
    ).toBe(false);
  });
});

// Phase 5 (docs/spec/phase-5.md §6.2): the note detail carries its recording, and the summary its
// status, so the page needs one fetch to choose its status row and home can draw the live tile.
type Parsed = { readonly success: boolean };

describe("the recording on a note", () => {
  // Read through a loose view: until phase 5 lands, neither key exists on the schemas.
  const fields = (schema: { shape: object }) =>
    schema.shape as Record<string, { safeParse: (value: unknown) => Parsed }>;

  it("is part of the note detail and the summary, nullable on both", () => {
    expect(fields(Note).recording?.safeParse(null).success).toBe(true);
    expect(fields(NoteSummary).recordingStatus?.safeParse(null).success).toBe(
      true
    );
  });

  it("carries only the id, status and duration on the note detail", () => {
    expect(
      fields(Note).recording?.safeParse({
        durationMs: null,
        id: "rec_0000000000000001",
        status: "recording",
      }).success
    ).toBe(true);
  });
});
