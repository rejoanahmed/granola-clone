import { OpenAPIHono } from "@hono/zod-openapi";
import * as CalErrors from "@kn/domain/Calendar/Errors";
import * as Shapes from "@kn/domain/Domain/Calendar";
import { isAppError, ValidationFailed } from "@kn/domain/Errors";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";
import { actor } from "../Testing";
import * as CalHttp from "./Http";

// docs/spec/phase-11.md §7 case 20, "Calendar.http.test.ts". Wire shape only: the path, the query
// coerced to a number, `c.var.svc.calendar`, and the statuses. The window's rules are
// `Calendar.test.ts`. The parent app mirrors `apps/api/src/app.ts` in the zod hook and an `onError`
// that honours an `AppError`'s status.
//
// Names these tests fix where the spec leaves them open: `calendarRouter` in `Calendar/Http.ts`,
// and `svc.calendar.upcoming(actor, { until })`.

type Schema = { safeParse: (value: unknown) => { success: boolean } };
type Call = { readonly args: readonly unknown[]; readonly method: string };
type ErrorClass = new (details: object) => Error;

const AT = Date.UTC(2026, 8, 25, 12);
const HOUR = 60 * 60 * 1000;
const UNTIL = AT + 36 * HOUR;

const PAGE = {
  items: [
    {
      attendees: [
        { email: "e2e-person@kothanote.test", isMe: true, name: "E2E Person" },
        { email: "priya@example.com", isMe: false, name: "Priya Raman" },
      ],
      color: "#DB35F2",
      endAt: AT + 2 * HOUR,
      id: "cev_e2e_person_2",
      noteId: null,
      startAt: AT + HOUR,
      title: "Catch up with the team",
    },
    {
      attendees: [],
      color: "#DB35F2",
      endAt: AT + 4 * HOUR,
      id: "cev_e2e_person_3",
      noteId: "not_0000000000000001",
      startAt: AT + 3 * HOUR,
      title: null,
    },
  ],
};

const errorClass = (name: string): ErrorClass => {
  const found = (CalErrors as Record<string, ErrorClass | undefined>)[name];
  if (found === undefined) {
    throw new Error(`no ${name} in @kn/domain/Calendar/Errors`);
  }
  return found;
};

const schema = (name: string): Schema => {
  const found = (Shapes as unknown as Record<string, Schema | undefined>)[name];
  if (found === undefined) {
    throw new Error(`no ${name} in @kn/domain/Domain/Calendar`);
  }
  return found;
};

const appAs = (who: Actor | null, answer: () => Promise<unknown>) => {
  const calls: Call[] = [];
  const svc = {
    calendar: {
      upcoming: (...args: unknown[]) => {
        calls.push({ args, method: "upcoming" });
        return answer();
      },
    },
  } as unknown as Container;

  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        throw new ValidationFailed({ issues: result.error.issues });
      }
    },
  });
  app.use("*", async (c, next) => {
    c.set("actor", who);
    c.set("svc", svc);
    await next();
  });
  app.route("/", CalHttp.calendarRouter);
  app.onError((err, c) =>
    isAppError(err)
      ? c.json({ _tag: err._tag, details: err.details }, err.status)
      : c.json({ _tag: "Internal" }, 500)
  );
  return { app, calls };
};

const ok = () => Promise.resolve(PAGE);

describe("GET /calendar/events", () => {
  it("answers 200 with the page, parsing as UpcomingEventsPage, and hands the service until as a number", async () => {
    const { app, calls } = appAs(actor(), ok);

    const res = await app.request(`/calendar/events?until=${UNTIL}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(PAGE);
    expect(schema("UpcomingEventsPage").safeParse(body).success).toBe(true);
    expect(calls).toEqual([
      { args: [actor(), { until: UNTIL }], method: "upcoming" },
    ]);
  });

  it("is 401 without an actor, and never reaches the service", async () => {
    const { app, calls } = appAs(null, ok);

    const res = await app.request(`/calendar/events?until=${UNTIL}`);

    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it.each([
    ["no until", "/calendar/events"],
    ["until=abc", "/calendar/events?until=abc"],
    ["a fractional until", `/calendar/events?until=${UNTIL}.5`],
  ])("is 422 for %s, and never reaches the service", async (_, path) => {
    const { app, calls } = appAs(actor(), ok);

    const res = await app.request(path);

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ _tag: "ValidationFailed" });
    expect(calls).toEqual([]);
  });

  it("is 503 CalendarUnavailable when the calendar is down", async () => {
    const Unavailable = errorClass("CalendarUnavailable");
    const { app } = appAs(actor(), () => Promise.reject(new Unavailable({})));

    const res = await app.request(`/calendar/events?until=${UNTIL}`);

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ _tag: "CalendarUnavailable" });
  });
});
