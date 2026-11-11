import { CalendarUnavailable } from "@kn/domain/Calendar/Errors";
import type { FakeCalendarRepo } from "./FakeCalendarRepo";
import type { CalendarMode, CalendarPort } from "./Port";

// There is no live client yet (docs/plan/BLOCKERS.md, "No live calendar client"), so this is what
// every local run, the unit tests and each Maestro flow read. Like `EmailFake`, it holds no rows
// of its own: `container.ts` hands it `FakeCalendarRepo`, because a Worker isolate cannot remember
// what the harness staged one request earlier; a test hands it an array.

export type CalendarFailure = "unavailable";

export type CalendarFakeCall =
  | ({ readonly method: "listEvents" } & Parameters<
      CalendarPort["listEvents"]
    >[0])
  | ({ readonly method: "getEvent" } & Parameters<CalendarPort["getEvent"]>[0]);

export type CalendarFakeDeps = {
  // Asked on every call, so a switch flipped by a flow is seen by the very next read.
  readonly readMode: () => Promise<CalendarMode>;
  readonly store: Pick<FakeCalendarRepo, "byId" | "listOverlapping">;
};

export const makeCalendarFake = (
  deps: CalendarFakeDeps
): CalendarPort & {
  readonly calls: readonly CalendarFakeCall[];
  failWith: (failure: CalendarFailure) => void;
  reset: () => void;
} => {
  const calls: CalendarFakeCall[] = [];
  let failure: CalendarFailure | null = null;

  // The call is recorded before the scripted failure, so a test can tell "asked and refused" from
  // "never asked".
  const guard = async (call: CalendarFakeCall): Promise<void> => {
    calls.push(call);
    if (failure === "unavailable" || (await deps.readMode()) === "fail") {
      throw new CalendarUnavailable({ method: call.method });
    }
  };

  return {
    calls,

    failWith: (next) => {
      failure = next;
    },

    getEvent: async (q) => {
      await guard({ method: "getEvent", ...q });
      return deps.store.byId(q);
    },

    listEvents: async (q) => {
      await guard({ method: "listEvents", ...q });
      return deps.store.listOverlapping(q);
    },

    reset: () => {
      calls.length = 0;
      failure = null;
    },
  };
};
