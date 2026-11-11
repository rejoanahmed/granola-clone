import type { CalendarEventId } from "@kn/domain/Domain/Calendar";
import type { UserId } from "@kn/domain/Domain/Ids";
import type { Timestamp } from "@kn/domain/Domain/Time";

// What reading a calendar means to this API, shaped by its two consumers (`CalendarService` and
// `RecordingsService.create`) rather than by any vendor. Nothing here is validated: a provider's
// title, colour and attendees arrive as it sends them, and the services normalise them.

export type CalendarEventRecord = {
  readonly attendees: readonly {
    readonly email: string | null;
    readonly name: string | null;
  }[];
  readonly color: string | null;
  readonly endAt: Timestamp;
  readonly id: string;
  readonly startAt: Timestamp;
  readonly title: string | null;
};

/** The harness's `calendar` switch: `fail` makes every read raise `CalendarUnavailable`. */
export type CalendarMode = "auto" | "fail";

export type CalendarPort = {
  /** Null when the event is not on this user's calendar. Fails with `CalendarUnavailable` (503). */
  getEvent: (q: {
    readonly eventId: CalendarEventId;
    readonly userId: UserId;
  }) => Promise<CalendarEventRecord | null>;
  /**
   * Events overlapping `[from, until)` on this user's calendar. The service re-filters, so a
   * provider that returns a little extra cannot leak it. Fails with `CalendarUnavailable` (503).
   */
  listEvents: (q: {
    readonly from: Timestamp;
    readonly until: Timestamp;
    readonly userId: UserId;
  }) => Promise<readonly CalendarEventRecord[]>;
};
