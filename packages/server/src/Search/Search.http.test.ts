import { SearchResults } from "@gc/domain/Domain/Search";
import { isAppError, ValidationFailed } from "@gc/domain/Errors";
import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";
import { actor } from "../Testing";
import { searchRouter } from "./Http";

// docs/spec/phase-8.md §7 case 12 and the search wire shape: the path, the trimmed query handed on,
// the verbatim body, the contract's validation, and no call without an actor. Rules are
// `Search.test.ts`. The parent app mirrors `apps/api/src/app.ts` in the zod hook and `onError`.

const RESULTS = {
  notes: [
    {
      id: "not_0000000000000001",
      source: "phone",
      startedAt: 1_700_000_000_000,
      title: "Weekly standup",
    },
  ],
  people: [
    {
      email: "priya@example.com",
      isMe: false,
      key: "email:priya@example.com",
      name: "Priya Raman",
    },
  ],
  query: "standup",
};

const appAs = (who: Actor | null) => {
  const calls: unknown[][] = [];
  const svc = {
    search: {
      search: (...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve(RESULTS);
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
  app.route("/", searchRouter);
  app.onError((err, c) =>
    isAppError(err)
      ? c.json({ _tag: err._tag, details: err.details }, err.status)
      : c.json({ _tag: "Internal" }, 500)
  );
  return { app, calls };
};

describe("GET /search", () => {
  it("answers SearchResults, handing the service the trimmed query", async () => {
    const { app, calls } = appAs(actor());

    const res = await app.request("/search?q=%20%20standup%20");

    expect(res.status).toBe(200);
    expect(SearchResults.strict().safeParse(await res.json()).success).toBe(
      true
    );
    expect(calls).toEqual([[actor(), { q: "standup" }]]);
  });

  it("is 401 without a session, and never reaches the service", async () => {
    const { app, calls } = appAs(null);

    const res = await app.request("/search?q=standup");

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ _tag: "Unauthorized" });
    expect(calls).toEqual([]);
  });

  // §7 case 12
  it.each([
    ["a blank q", "/search?q=%20%20%20"],
    ["a missing q", "/search"],
    ["a q of 101 characters", `/search?q=${"x".repeat(101)}`],
  ])("is 422 for %s", async (_what, path) => {
    const { app, calls } = appAs(actor());

    const res = await app.request(path);

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ _tag: "ValidationFailed" });
    expect(calls).toEqual([]);
  });
});
