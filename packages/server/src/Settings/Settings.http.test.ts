import * as Shapes from "@gc/domain/Domain/Settings";
import { isAppError, ValidationFailed } from "@gc/domain/Errors";
import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";
import { actor } from "../Testing";
import { settingsRouter } from "./Http";

// docs/spec/phase-10.md §7 "Settings/Settings.http.test.ts". Wire shape only: the paths,
// `c.var.svc.settings`, the contract's strict patch and the statuses. Rules are `Settings.test.ts`.
// The parent app mirrors `apps/api/src/app.ts` in the zod hook and an `onError` that honours an
// `AppError`'s status.

type Schema = { safeParse: (value: unknown) => { success: boolean } };
type Call = { readonly args: readonly unknown[]; readonly method: string };

const SETTINGS = {
  chatDictationAutoSend: true,
  notifyUpcomingMeetings: true,
  useDataForTraining: true,
};

const appAs = (who: Actor | null) => {
  const calls: Call[] = [];
  const svc = {
    settings: {
      get: (...args: unknown[]) => {
        calls.push({ args, method: "get" });
        return Promise.resolve(SETTINGS);
      },
      update: (...args: unknown[]) => {
        calls.push({ args, method: "update" });
        return Promise.resolve({
          ...SETTINGS,
          ...(args[1] as Record<string, unknown>),
        });
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
  app.route("/", settingsRouter);
  app.onError((err, c) =>
    isAppError(err)
      ? c.json({ _tag: err._tag }, err.status)
      : c.json({ _tag: "Internal" }, 500)
  );
  return { app, calls };
};

const patch = (who: Actor | null, body: unknown) => {
  const built = appAs(who);
  return {
    ...built,
    response: built.app.request("/me/settings", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
  };
};

const userSettings = (): Schema => {
  const found = (Shapes as unknown as Record<string, Schema | undefined>)
    .UserSettings;
  if (found === undefined) {
    throw new Error("no UserSettings in @gc/domain/Domain/Settings");
  }
  return found;
};

describe("GET /me/settings", () => {
  it("answers 200 with the caller's settings, parsing as UserSettings", async () => {
    const { app, calls } = appAs(actor());

    const res = await app.request("/me/settings");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(SETTINGS);
    expect(userSettings().safeParse(body).success).toBe(true);
    expect(calls).toEqual([{ args: [actor()], method: "get" }]);
  });

  it("is 401 without an actor, and never reaches the service", async () => {
    const { app, calls } = appAs(null);

    const res = await app.request("/me/settings");

    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });
});

describe("PATCH /me/settings", () => {
  it("hands the service the caller and the patch, and answers 200 with the settings", async () => {
    const { calls, response } = patch(actor(), {
      notifyUpcomingMeetings: false,
    });

    const res = await response;

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ...SETTINGS,
      notifyUpcomingMeetings: false,
    });
    expect(calls).toEqual([
      {
        args: [actor(), { notifyUpcomingMeetings: false }],
        method: "update",
      },
    ]);
  });

  it.each([
    ["a non-boolean value", { notifyUpcomingMeetings: "no" }],
    ["an unknown key (strict object)", { extra: true }],
  ])("is 422 ValidationFailed for %s", async (_what, body) => {
    const { calls, response } = patch(actor(), body);

    const res = await response;

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ _tag: "ValidationFailed" });
    expect(calls).toEqual([]);
  });

  it("is 401 without an actor, and never reaches the service", async () => {
    const { calls, response } = patch(null, { notifyUpcomingMeetings: false });

    const res = await response;

    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });
});
