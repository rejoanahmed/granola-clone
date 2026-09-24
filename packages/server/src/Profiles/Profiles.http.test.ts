import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";
import { actor } from "../Testing";
import { profilesRouter } from "./Http";

// Wire shape only — the path, `c.var.svc`, the verbatim body, and the one branch a handler owns:
// no actor, no call. Business rules are `Profiles.test.ts`, and turning the thrown `Unauthorized`
// into a 401 belongs to `apps/api/src/on-error.ts`.

const profile = {
  createdAt: 1_700_000_000_000,
  email: "usr_person_0001@example.test",
  emailVerified: true,
  id: "usr_person_0001",
  name: "Person One",
};

const appAs = (who: Actor | null) => {
  const calls: string[] = [];
  const svc = {
    profiles: {
      me: (caller: Actor) => {
        calls.push(caller.id);
        return Promise.resolve(profile);
      },
    },
  } as unknown as Container;

  const app = new OpenAPIHono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("actor", who);
    c.set("svc", svc);
    await next();
  });
  app.route("/", profilesRouter);
  app.onError((err, c) =>
    c.json({ _tag: (err as { _tag?: string })._tag ?? "Internal" }, 500)
  );
  return { app, calls };
};

describe("profilesRouter", () => {
  it("serialises the caller's profile at GET /me", async () => {
    const { app, calls } = appAs(actor());

    const res = await app.request("/me");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(profile);
    expect(calls).toEqual([actor().id]);
  });

  it("never reaches the service without an actor", async () => {
    const { app, calls } = appAs(null);

    const res = await app.request("/me");

    expect(await res.json()).toEqual({ _tag: "Unauthorized" });
    expect(calls).toEqual([]);
  });
});
