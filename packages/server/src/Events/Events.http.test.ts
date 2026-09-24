import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Container } from "../container";
import { organiser } from "../Testing";
import { eventsRouter } from "./Http";

// Wire shape only — paths, `c.var.svc`, verbatim body. Business rules are `Events.test.ts`, and
// error mapping belongs to `apps/api/src/on-error.ts`.

const AT = 1_700_000_000_000;
const DAY_MS = 86_400_000;

const summary = {
  city: "Dhaka",
  endsAt: AT + 2 * DAY_MS,
  id: "evt_0000000000000001",
  slug: "dhaka-indie-night",
  startsAt: AT + DAY_MS,
  status: "published",
  title: "Dhaka Indie Night",
  venue: "Aloki",
};

const event = {
  ...summary,
  createdAt: AT,
  description: null,
  organiserId: "usr_organiser_0001",
  publishedAt: AT,
  updatedAt: AT,
};

const calls: string[] = [];

const svc = {
  events: {
    listPublished: () => {
      calls.push("listPublished");
      return Promise.resolve({ items: [summary], nextCursor: null });
    },
    publish: () => {
      calls.push("publish");
      return Promise.resolve(event);
    },
  },
} as unknown as Container;

const app = new OpenAPIHono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("actor", organiser());
  c.set("svc", svc);
  await next();
});
app.route("/", eventsRouter);

describe("eventsRouter", () => {
  it("serialises the public feed at GET /events", async () => {
    const res = await app.request("/events?limit=2");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [summary], nextCursor: null });
    expect(calls).toContain("listPublished");
  });

  it("mounts the organiser publish route where the contract declares it", async () => {
    const res = await app.request(
      "/organiser/events/evt_0000000000000001/publish",
      { method: "POST" }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(event);
    expect(calls).toContain("publish");
  });
});
