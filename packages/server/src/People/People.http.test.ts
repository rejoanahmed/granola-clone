import { OpenAPIHono } from "@hono/zod-openapi";
import { Person } from "@kn/domain/Domain/Person";
import { isAppError, ValidationFailed } from "@kn/domain/Errors";
import { PersonNotFound } from "@kn/domain/People/Errors";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";
import { actor } from "../Testing";
import { peopleRouter } from "./Http";

// docs/spec/phase-8.md §7, the people wire shape: the path, the URL-decoded key, the verbatim body,
// the contract's validation, and no call without an actor. Rules are `People.test.ts`. The parent
// app mirrors `apps/api/src/app.ts` in the zod hook and in an `onError` that honours a status.

const PRIYA = {
  domain: "example.com",
  email: "priya@example.com",
  isMe: false,
  key: "email:priya@example.com",
  name: "Priya Raman",
};

const appAs = (
  who: Actor | null,
  answer: (key: string) => Promise<unknown> = () => Promise.resolve(PRIYA)
) => {
  const calls: unknown[][] = [];
  const svc = {
    people: {
      get: (...args: unknown[]) => {
        calls.push(args);
        return answer(String(args[1]));
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
  app.route("/", peopleRouter);
  app.onError((err, c) =>
    isAppError(err)
      ? c.json({ _tag: err._tag, details: err.details }, err.status)
      : c.json({ _tag: "Internal" }, 500)
  );
  return { app, calls };
};

describe("GET /people/{personKey}", () => {
  it("answers a Person for a URL-encoded key, handing the service the decoded key", async () => {
    const { app, calls } = appAs(actor());

    const res = await app.request("/people/email%3Apriya%40example.com");

    expect(res.status).toBe(200);
    expect(Person.strict().safeParse(await res.json()).success).toBe(true);
    expect(calls).toEqual([[actor(), "email:priya@example.com"]]);
  });

  it("is 401 without a session, and never reaches the service", async () => {
    const { app, calls } = appAs(null);

    const res = await app.request("/people/email%3Apriya%40example.com");

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ _tag: "Unauthorized" });
    expect(calls).toEqual([]);
  });

  it("is 404 PersonNotFound as the error body, naming only the key sent", async () => {
    const { app } = appAs(actor(), (key) =>
      Promise.reject(new PersonNotFound({ personKey: key }))
    );

    const res = await app.request("/people/email%3Anobody%40example.com");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      _tag: "PersonNotFound",
      details: { personKey: "email:nobody@example.com" },
    });
  });

  it("is 422 for a key with a bad prefix", async () => {
    const { app, calls } = appAs(actor());

    const res = await app.request("/people/person%3Apriya");

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ _tag: "ValidationFailed" });
    expect(calls).toEqual([]);
  });
});
