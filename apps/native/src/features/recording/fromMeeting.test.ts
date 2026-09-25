import { ApiError } from "@gc/apiclient";
import { describe, expect, it, vi } from "vitest";

vi.mock("@native/lib/api", async () => {
  const real = await import("@gc/apiclient");
  return {
    calendarEventNoteId: real.calendarEventNoteId,
    isCalendarEventNotFound: real.isCalendarEventNotFound,
  };
});

const { meetingAttendeeNames, meetingLiveTitle, ownerLabelOf, startFailureOf } =
  await import("./fromMeeting");

const apiError = (tag: string, status: number, details = {}) =>
  new ApiError({ details, message: tag, status, tag });

describe("startFailureOf", () => {
  it("reads a 404 CalendarEventNotFound as the meeting gone", () => {
    expect(startFailureOf(apiError("CalendarEventNotFound", 404))).toEqual({
      kind: "eventGone",
    });
  });

  it("reads a 409 CalendarEventHasNote as the other device's note", () => {
    expect(
      startFailureOf(
        apiError("CalendarEventHasNote", 409, { noteId: "not_winner" })
      )
    ).toEqual({ kind: "taken", noteId: "not_winner" });
  });

  it("falls back to the generic failure for a 409 without a note id", () => {
    expect(startFailureOf(apiError("CalendarEventHasNote", 409))).toEqual({
      kind: "other",
    });
  });

  it("leaves every other failure to phase 5", () => {
    expect(startFailureOf(apiError("NetworkError", 0))).toEqual({
      kind: "other",
    });
    expect(startFailureOf(new Error("boom"))).toEqual({ kind: "other" });
  });
});

describe("meetingAttendeeNames", () => {
  const attendee = (
    name: string | null,
    email: string | null,
    isMe = false
  ) => ({ email, isMe, name });

  it("puts the owner first and drops the owner's own entry", () => {
    expect(
      meetingAttendeeNames(
        {
          attendees: [
            attendee("Priya Raman", "priya@example.com"),
            attendee("Sam Okafor", "sam@example.com"),
            attendee("E2E Person", "e2e-person@gcnotes.test", true),
          ],
        },
        "E2E Person"
      )
    ).toEqual(["E2E Person", "Priya Raman", "Sam Okafor"]);
  });

  it("uses the email when there is no name, and counts every guest the server sent", () => {
    expect(
      meetingAttendeeNames(
        {
          attendees: [
            attendee(null, "dana@example.com"),
            attendee("Dana Lee", null),
          ],
        },
        "Me"
      )
    ).toEqual(["Me", "dana@example.com", "Dana Lee"]);
  });
});

describe("meetingLiveTitle", () => {
  it("draws a blank title as the placeholder, and trims and cuts one as the note holds it", () => {
    expect(meetingLiveTitle({ title: null })).toBeNull();
    expect(meetingLiveTitle({ title: "   " })).toBeNull();
    expect(meetingLiveTitle({ title: "  Catch up  " })).toBe("Catch up");
    const long = Array.from({ length: 60 }, (_, n) => `word${n}`).join(" ");
    const cut = meetingLiveTitle({ title: long }) ?? "";
    expect(cut.length).toBeLessThanOrEqual(200);
    expect(long.startsWith(cut)).toBe(true);
    expect(long[cut.length]).toBe(" ");
  });
});

describe("ownerLabelOf", () => {
  it("names the owner, falling back to the address when the account has no name", () => {
    expect(ownerLabelOf({ email: "me@example.com", name: "E2E Person" })).toBe(
      "E2E Person"
    );
    expect(ownerLabelOf({ email: "me@example.com", name: "" })).toBe(
      "me@example.com"
    );
    expect(ownerLabelOf({ email: "me@example.com", name: null })).toBe(
      "me@example.com"
    );
    expect(ownerLabelOf(undefined)).toBe("");
  });
});
