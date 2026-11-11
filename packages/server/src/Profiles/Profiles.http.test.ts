import { OpenAPIHono } from "@hono/zod-openapi";
import * as ProfileShapes from "@kn/domain/Domain/Profile";
import { Profile } from "@kn/domain/Domain/Profile";
import { isAppError, ValidationFailed } from "@kn/domain/Errors";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";
import { actor } from "../Testing";
import { profilesRouter } from "./Http";

// Wire shape only — the path, `c.var.svc`, the verbatim body, the contract's validation, and the
// one branch a handler owns: no actor, no call. Business rules are `Profiles.test.ts`. The parent
// app below mirrors `apps/api/src/app.ts` in the two places that decide a status: the zod hook
// (a rejected body is `ValidationFailed`, 422) and an `onError` that honours an `AppError`'s status.

const profile = {
  companyDescription: null,
  companyName: null,
  createdAt: 1_700_000_000_000,
  email: "usr_person_0001@example.test",
  emailVerified: true,
  id: "usr_person_0001",
  jobTitle: null,
  linkedinUsername: null,
  name: "Person One",
  onboardedAt: null,
  userType: null,
};

type Call = { readonly args: readonly unknown[]; readonly method: string };

const appAs = (who: Actor | null) => {
  const calls: Call[] = [];
  const answer =
    (method: string, over: Record<string, unknown> = {}) =>
    (...args: unknown[]) => {
      calls.push({ args, method });
      return Promise.resolve({ ...profile, ...over });
    };
  const svc = {
    profiles: {
      completeOnboarding: answer("completeOnboarding", {
        onboardedAt: 1_700_000_000_000,
      }),
      // Phase 10 (docs/spec/phase-10.md §6.1): the preview answers a count, the delete nothing.
      deleteAccount: (...args: unknown[]) => {
        calls.push({ args, method: "deleteAccount" });
        return Promise.resolve();
      },
      deletionPreview: (...args: unknown[]) => {
        calls.push({ args, method: "deletionPreview" });
        return Promise.resolve({ noteCount: 3 });
      },
      me: answer("me"),
      update: (caller: Actor, patch: Record<string, unknown>) =>
        answer("update", patch)(caller, patch),
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
  app.route("/", profilesRouter);
  app.onError((err, c) =>
    isAppError(err)
      ? c.json({ _tag: err._tag }, err.status)
      : c.json({ _tag: "Internal" }, 500)
  );
  return { app, calls };
};

const patchMe = (who: Actor | null, body: unknown) => {
  const built = appAs(who);
  return {
    ...built,
    response: built.app.request("/me", {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
  };
};

describe("profilesRouter", () => {
  // §7 case 10
  it("serialises the caller's extended profile at GET /me", async () => {
    const { app, calls } = appAs(actor());

    const res = await app.request("/me");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(profile);
    expect(Profile.strict().safeParse(body).success).toBe(true);
    expect(calls).toEqual([{ args: [actor()], method: "me" }]);
  });

  it("never reaches the service without an actor", async () => {
    const { app, calls } = appAs(null);

    const res = await app.request("/me");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ _tag: "Unauthorized" });
    expect(calls).toEqual([]);
  });
});

describe("PATCH /me", () => {
  // §7 case 14
  it("hands the service the caller and the patch, and answers 200 with the patched profile", async () => {
    const patch = { companyName: "Acme", jobTitle: "Designer" };
    const { calls, response } = patchMe(actor(), patch);

    const res = await response;

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject(patch);
    expect(calls).toEqual([
      { args: [actor(), expect.objectContaining(patch)], method: "update" },
    ]);
  });

  // §7 cases 11–13: the contract refuses before the service is reached.
  it.each([
    ["an unknown user type", { userType: "astronaut" }],
    ["a key the patch does not own (strict object)", { name: "x" }],
    ["a LinkedIn username with a space", { linkedinUsername: "a b" }],
    ["a company name over 100 characters", { companyName: "x".repeat(101) }],
  ])("is 422 ValidationFailed for %s", async (_what, body) => {
    const { calls, response } = patchMe(actor(), body);

    const res = await response;

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ _tag: "ValidationFailed" });
    expect(calls).toEqual([]);
  });

  // §7 case 15
  it("is 401 without an actor, and never reaches the service", async () => {
    const { calls, response } = patchMe(null, { jobTitle: "Designer" });

    const res = await response;

    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });
});

describe("POST /me/onboarding", () => {
  // §7 case 14
  it("answers 200 with onboardedAt a number, taking no body", async () => {
    const { app, calls } = appAs(actor());

    const res = await app.request("/me/onboarding", { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      onboardedAt: expect.any(Number),
    });
    expect(calls).toEqual([{ args: [actor()], method: "completeOnboarding" }]);
  });

  // §7 case 15
  it("is 401 without an actor, and never reaches the service", async () => {
    const { app, calls } = appAs(null);

    const res = await app.request("/me/onboarding", { method: "POST" });

    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });
});

// ── Phase 10: the deletion preview and DELETE /me (docs/spec/phase-10.md §7, §6.1) ────────────
// That a following GET /me with the same cookie is a 401 needs the real session middleware, so it is
// `apps/api/src/e2e-harness.test.ts`'s.

type Schema = { safeParse: (value: unknown) => { success: boolean } };

const deletionPreviewShape = (): Schema => {
  const found = (ProfileShapes as unknown as Record<string, Schema | undefined>)
    .DeletionPreview;
  if (found === undefined) {
    throw new Error("no DeletionPreview in @kn/domain/Domain/Profile");
  }
  return found;
};

describe("GET /me/deletion-preview", () => {
  it("answers 200 with the caller's live note count, parsing as DeletionPreview", async () => {
    const { app, calls } = appAs(actor());

    const res = await app.request("/me/deletion-preview");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ noteCount: 3 });
    expect(deletionPreviewShape().safeParse(body).success).toBe(true);
    expect(calls).toEqual([{ args: [actor()], method: "deletionPreview" }]);
  });

  it("is 401 without an actor, and never reaches the service", async () => {
    const { app, calls } = appAs(null);

    const res = await app.request("/me/deletion-preview");

    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });
});

describe("DELETE /me", () => {
  it("answers 204 with an empty body, having handed the service the caller", async () => {
    const { app, calls } = appAs(actor());

    const res = await app.request("/me", { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(calls).toEqual([{ args: [actor()], method: "deleteAccount" }]);
  });

  it("is 401 without an actor, and never reaches the service", async () => {
    const { app, calls } = appAs(null);

    const res = await app.request("/me", { method: "DELETE" });

    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });
});
