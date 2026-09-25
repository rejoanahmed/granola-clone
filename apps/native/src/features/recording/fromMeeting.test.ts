import { ApiError } from "@gc/apiclient";
import { describe, expect, it, vi } from "vitest";

vi.mock("@native/lib/api", async () => {
  const real = await import("@gc/apiclient");
  return {
    calendarEventNoteId: real.calendarEventNoteId,
    isCalendarEventNotFound: real.isCalendarEventNotFound,
  };
});

const { meetingAttendeeNames, startFailureOf } = await import("./fromMeeting");

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

  it("uses the email when there is no name, and dedupes by email", () => {
    expect(
      meetingAttendeeNames(
        {
          attendees: [
            attendee(null, "dana@example.com"),
            attendee("Dana Lee", "DANA@example.com"),
            attendee(null, null),
          ],
        },
        "Me"
      )
    ).toEqual(["Me", "dana@example.com"]);
  });
});
