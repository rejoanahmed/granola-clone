import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Container } from "../container";
import { organiser } from "../Testing";
import { ticketsRouter } from "./Http";

// Wire shape only: business rules live in `Tickets.test.ts` and error mapping in
// `apps/api/src/on-error.ts`.

const AT = 1_700_000_000_000;
const DAY_MS = 86_400_000;

const EVENT_ID = "evt_0000000000000001";
const REGISTRATION_ID = "reg_0000000000000001";
const TICKET_TYPE_ID = "tty_0000000000000001";
/** Ten Crockford characters, so `CheckInInput` parses it rather than 400-ing the route. */
const CODE = "0ABCDEFGHJ";

const eventSummary = {
  city: "Dhaka",
  endsAt: AT + 2 * DAY_MS,
  id: EVENT_ID,
  slug: "dhaka-indie-night",
  startsAt: AT + DAY_MS,
  status: "published",
  title: "Dhaka Indie Night",
  venue: "Aloki",
};

const registration = {
  attendeeId: "usr_attendee_0001",
  attendeeName: "Rifat Ahmed",
  attendeePhone: "8801712345678",
  confirmedAt: null,
  createdAt: AT,
  eventId: EVENT_ID,
  holdExpiresAt: AT + 30 * 60_000,
  id: REGISTRATION_ID,
  releasedAt: null,
  releaseReason: null,
  status: "pending",
  totalPoisha: 100_000,
  updatedAt: AT,
};

const detail = {
  ...registration,
  event: eventSummary,
  holdExpiresInMs: 30 * 60_000,
  items: [
    {
      quantity: 2,
      registrationId: REGISTRATION_ID,
      ticketTypeId: TICKET_TYPE_ID,
      unitPricePoisha: 50_000,
    },
  ],
  tickets: [],
};

const ticket = {
  checkedInAt: AT,
  checkedInBy: "usr_organiser_0001",
  code: CODE,
  eventId: EVENT_ID,
  id: "tkt_0000000000000001_1",
  issuedAt: AT,
  registrationId: REGISTRATION_ID,
  seq: 1,
  status: "checked_in",
  ticketTypeId: TICKET_TYPE_ID,
  voidedAt: null,
};

const attendeeRow = {
  attendeeName: "Rifat Ahmed",
  attendeePhone: "8801712345678",
  checkedInCount: 1,
  registrationId: REGISTRATION_ID,
  ticketCount: 2,
};

// Recorded so a test can say which use case the path reached, and with what.
const calls: { args: readonly unknown[]; name: string }[] = [];

const record =
  <A>(name: string, answer: A) =>
  (...args: unknown[]): Promise<A> => {
    calls.push({ args, name });
    return Promise.resolve(answer);
  };

const svc = {
  tickets: {
    attendees: record("attendees", { items: [attendeeRow], nextCursor: null }),
    checkIn: record("checkIn", ticket),
    register: record("register", detail),
  },
} as unknown as Container;

const app = new OpenAPIHono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("actor", organiser());
  c.set("svc", svc);
  await next();
});
app.route("/", ticketsRouter);

const postJson = (path: string, body: unknown) =>
  app.request(path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

describe("ticketsRouter", () => {
  it("answers 201 with the hold at POST /events/{eventId}/registrations", async () => {
    const res = await postJson(`/events/${EVENT_ID}/registrations`, {
      attendeeName: "Rifat Ahmed",
      attendeePhone: "8801712345678",
      lines: [{ quantity: 2, ticketTypeId: TICKET_TYPE_ID }],
    });

    // 201 is the contract, not a default: a hold is a creation and the client keys off it.
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(detail);

    const call = calls.find((entry) => entry.name === "register");
    expect(call?.args[1]).toBe(EVENT_ID);
    expect(call?.args[2]).toMatchObject({
      lines: [{ quantity: 2, ticketTypeId: TICKET_TYPE_ID }],
    });
  });

  it("mounts the gate under /organiser and passes the parsed code through", async () => {
    const res = await postJson("/organiser/tickets/check-in", { code: CODE });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ticket);
    // `code`, not the whole `CheckInInput` body — the service takes a `TicketCode`.
    expect(calls.find((entry) => entry.name === "checkIn")?.args[0]).toBe(CODE);
  });

  it("serialises the door list, with PageQuery's defaults applied", async () => {
    const res = await app.request(
      `/organiser/events/${EVENT_ID}/attendees?limit=2`
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [attendeeRow],
      nextCursor: null,
    });
    // `cursor` arrives as `null`, not `undefined`: the repo's keyset branches on `null`.
    expect(calls.find((entry) => entry.name === "attendees")?.args[2]).toEqual({
      cursor: null,
      limit: 2,
    });
  });
});
