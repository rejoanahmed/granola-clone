import * as Shapes from "@gc/domain/Domain/Support";
import { EmailUnavailable } from "@gc/domain/Email/Errors";
import { isAppError, ValidationFailed } from "@gc/domain/Errors";
import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";
import { actor } from "../Testing";
// @ts-expect-error phase 10: the support router is specified (phase-10.md §6.1, §11 API 6), not built
import { supportRouter } from "./Http";

// docs/spec/phase-10.md §7 "Support/Support.http.test.ts". Wire shape only: the three paths,
// `c.var.svc.support`, the strict bodies, the 202 and the port's 503. Rules are `Support.test.ts`.
// The parent app mirrors `apps/api/src/app.ts` in the zod hook and an `onError` that honours an
// `AppError`'s status.

type Schema = { safeParse: (value: unknown) => { success: boolean } };
type Call = { readonly args: readonly unknown[]; readonly method: string };

const VERSION = "1.0.0 (1)";
const RECEIPT = { id: "sup_0000000000000001" };

const appAs = (who: Actor | null, failing = false) => {
  const calls: Call[] = [];
  const method =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ args, method: name });
      return failing
        ? Promise.reject(new EmailUnavailable({ kind: name }))
        : Promise.resolve(RECEIPT);
    };
  const svc = {
    support: {
      createBugReport: method("createBugReport"),
      createDesktopReminder: method("createDesktopReminder"),
      createFeedback: method("createFeedback"),
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
  app.route("/", supportRouter);
  app.onError((err, c) =>
    isAppError(err)
      ? c.json({ _tag: err._tag }, err.status)
      : c.json({ _tag: "Internal" }, 500)
  );
  return { app, calls };
};

const post = (app: OpenAPIHono<AppEnv>, path: string, body?: unknown) =>
  app.request(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { "content-type": "application/json" },
    method: "POST",
  });

const receiptShape = (): Schema => {
  const found = (Shapes as unknown as Record<string, Schema | undefined>)
    .SupportReceipt;
  if (found === undefined) {
    throw new Error("no SupportReceipt in @gc/domain/Domain/Support");
  }
  return found;
};

const FORMS = [
  [
    "/support/bug-reports",
    "createBugReport",
    {
      appVersion: VERSION,
      includeDiagnostics: false,
      message: "Steps: tapped Share twice",
    },
  ],
  [
    "/support/feedback",
    "createFeedback",
    { appVersion: VERSION, message: "Love the search" },
  ],
] as const;

describe("the support forms", () => {
  it.each(FORMS)(
    "POST %s answers 202 with a SupportReceipt, having handed %s the caller and the body",
    async (path, name, body) => {
      const { app, calls } = appAs(actor());

      const res = await post(app, path, body);

      expect(res.status).toBe(202);
      const answered = await res.json();
      expect(answered).toEqual(RECEIPT);
      expect(receiptShape().safeParse(answered).success).toBe(true);
      expect(calls).toEqual([{ args: [actor(), body], method: name }]);
    }
  );

  it.each(FORMS)("POST %s is 422 on {}", async (path) => {
    const { app, calls } = appAs(actor());

    const res = await post(app, path, {});

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ _tag: "ValidationFailed" });
    expect(calls).toEqual([]);
  });

  it.each(FORMS)(
    "POST %s is 422 on an extra key (strict object)",
    async (path, _name, body) => {
      const { app, calls } = appAs(actor());

      const res = await post(app, path, { ...body, extra: true });

      expect(res.status).toBe(422);
      expect(calls).toEqual([]);
    }
  );
});

describe("POST /me/desktop-reminder", () => {
  it("answers 202 with a SupportReceipt, taking no body", async () => {
    const { app, calls } = appAs(actor());

    const res = await post(app, "/me/desktop-reminder");

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual(RECEIPT);
    expect(calls).toEqual([
      { args: [actor()], method: "createDesktopReminder" },
    ]);
  });
});

describe("the support routes when email is down", () => {
  it.each([
    [FORMS[0][0], FORMS[0][2]],
    [FORMS[1][0], FORMS[1][2]],
    ["/me/desktop-reminder", undefined],
  ] as const)("POST %s maps EmailUnavailable to 503", async (path, body) => {
    const { app } = appAs(actor(), true);

    const res = await post(app, path, body);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ _tag: "EmailUnavailable" });
  });
});

describe("the support routes without a session", () => {
  it.each([
    [FORMS[0][0], FORMS[0][2]],
    [FORMS[1][0], FORMS[1][2]],
    ["/me/desktop-reminder", undefined],
  ] as const)(
    "POST %s is 401, and never reaches the service",
    async (path, body) => {
      const { app, calls } = appAs(null);

      const res = await post(app, path, body);

      expect(res.status).toBe(401);
      expect(calls).toEqual([]);
    }
  );
});
