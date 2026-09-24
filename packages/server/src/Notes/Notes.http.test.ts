import { Note, NoteSummary } from "@gc/domain/Domain/Note";
import { isAppError, ValidationFailed } from "@gc/domain/Errors";
import { PageOf } from "@gc/domain/Http";
import { NoteNotFound, NoteTrashed } from "@gc/domain/Notes/Errors";
import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";
import { actor } from "../Testing";
import { notesRouter } from "./Http";

// docs/spec/phase-4.md §7 cases 18–24. Wire shape only — the paths, `c.var.svc`, the verbatim
// body, the contract's validation, and the one branch a handler owns: no actor, no call. Business
// rules are `Notes.test.ts`. The parent app mirrors `apps/api/src/app.ts` in the two places that
// decide a status: the zod hook (a rejected input is `ValidationFailed`, 422) and an `onError` that
// honours an `AppError`'s status.

const NOTE_ID = "not_0000000000000001";
const AT = 1_700_000_000_000;

const NOTE = {
  attendees: [
    {
      email: "usr_person_0001@example.test",
      id: "att_0000000000000001",
      isMe: true,
      name: "Person One",
    },
  ],
  bodyMarkdown: "### Updates\n\n- Pagination merged",
  createdAt: AT,
  id: NOTE_ID,
  recording: null,
  source: "phone",
  startedAt: AT,
  title: "Weekly standup",
  trashedAt: null,
  updatedAt: AT,
};

const SUMMARY = {
  attendeeCount: 1,
  id: NOTE_ID,
  recordingStatus: null,
  source: "phone",
  startedAt: AT,
  title: "Weekly standup",
};

type Call = { readonly args: readonly unknown[]; readonly method: string };

type Answers = Partial<Record<string, (...args: unknown[]) => unknown>>;

const appAs = (who: Actor | null, answers: Answers = {}) => {
  const calls: Call[] = [];
  const method =
    (name: string, answer: unknown) =>
    (...args: unknown[]) => {
      calls.push({ args, method: name });
      const override = answers[name];
      return Promise.resolve(
        override === undefined ? answer : override(...args)
      );
    };
  const svc = {
    notes: {
      create: method("create", NOTE),
      get: method("get", NOTE),
      list: method("list", { items: [SUMMARY], nextCursor: null }),
      restore: method("restore", NOTE),
      trash: method("trash", { ...NOTE, trashedAt: AT }),
      update: method("update", NOTE),
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
  app.route("/", notesRouter);
  app.onError((err, c) =>
    isAppError(err)
      ? c.json({ _tag: err._tag, details: err.details }, err.status)
      : c.json({ _tag: "Internal" }, 500)
  );
  return { app, calls };
};

const send = (
  app: OpenAPIHono<AppEnv>,
  method: string,
  path: string,
  body?: unknown
) =>
  app.request(path, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { "content-type": "application/json" },
    method,
  });

const ROUTES = [
  ["GET", "/notes", undefined],
  ["POST", "/notes", {}],
  ["GET", `/notes/${NOTE_ID}`, undefined],
  ["PATCH", `/notes/${NOTE_ID}`, { title: "New" }],
  ["POST", `/notes/${NOTE_ID}/trash`, undefined],
  ["POST", `/notes/${NOTE_ID}/restore`, undefined],
] as const;

describe("notesRouter, anonymous", () => {
  // §7 case 18
  it.each(ROUTES)(
    "is 401 for %s %s and never reaches the service",
    async (method, path, body) => {
      const { app, calls } = appAs(null);

      const res = await send(app, method, path, body);

      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ _tag: "Unauthorized" });
      expect(calls).toEqual([]);
    }
  );
});

describe("POST /notes and GET /notes", () => {
  // §7 case 19
  it("creates with a 201 whose body is a Note", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", "/notes", { title: "Weekly standup" });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Note.strict().safeParse(body).success).toBe(true);
    expect(calls).toEqual([
      {
        args: [actor(), expect.objectContaining({ title: "Weekly standup" })],
        method: "create",
      },
    ]);
  });

  it("lists a page of summaries that carry no body", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "GET", "/notes?limit=5");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Record<string, unknown>[] };
    expect(PageOf(NoteSummary.strict()).safeParse(body).success).toBe(true);
    for (const item of body.items) {
      expect(item).not.toHaveProperty("bodyMarkdown");
    }
    expect(calls).toEqual([
      {
        args: [actor(), expect.objectContaining({ cursor: null, limit: 5 })],
        method: "list",
      },
    ]);
  });

  it("hands the service the default page when no query is sent", async () => {
    const { app, calls } = appAs(actor());

    await send(app, "GET", "/notes");

    expect(calls[0]?.args[1]).toEqual({ cursor: null, limit: 20 });
  });

  // §7 case 20
  it.each([
    ["a limit of 0", "/notes?limit=0"],
    ["a limit of 101", "/notes?limit=101"],
    ["an empty cursor", "/notes?cursor="],
  ])("is 422 for %s", async (_what, path) => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "GET", path);

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ _tag: "ValidationFailed" });
    expect(calls).toEqual([]);
  });

  // §7 case 21
  it.each([
    ["a blank title", { title: "   " }],
    ["a title over 200 characters", { title: "x".repeat(201) }],
    ["a key the contract does not own (strict)", { owner: "usr_person_0002" }],
    ["an attendee with neither name nor email", { attendees: [{}] }],
  ])("is 422 to create with %s", async (_what, body) => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", "/notes", body);

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ _tag: "ValidationFailed" });
    expect(calls).toEqual([]);
  });
});

describe("GET, PATCH, trash and restore of one note", () => {
  it("reads one note at GET /notes/{id}", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "GET", `/notes/${NOTE_ID}`);

    expect(res.status).toBe(200);
    expect(Note.strict().safeParse(await res.json()).success).toBe(true);
    expect(calls).toEqual([{ args: [actor(), NOTE_ID], method: "get" }]);
  });

  // §7 case 22
  it("is 422 to PATCH a key the patch does not own, and 200 for a valid patch", async () => {
    const refused = appAs(actor());
    const bad = await send(refused.app, "PATCH", `/notes/${NOTE_ID}`, {
      ownerId: "usr_person_0002",
    });
    expect(bad.status).toBe(422);
    expect(refused.calls).toEqual([]);

    const accepted = appAs(actor());
    const good = await send(accepted.app, "PATCH", `/notes/${NOTE_ID}`, {
      bodyMarkdown: "Edited",
    });
    expect(good.status).toBe(200);
    expect(accepted.calls).toEqual([
      {
        args: [actor(), NOTE_ID, { bodyMarkdown: "Edited" }],
        method: "update",
      },
    ]);
  });

  it.each([
    ["trash", `/notes/${NOTE_ID}/trash`],
    ["restore", `/notes/${NOTE_ID}/restore`],
  ])("answers 200 to POST %s, taking no body", async (name, path) => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", path);

    expect(res.status).toBe(200);
    expect(Note.strict().safeParse(await res.json()).success).toBe(true);
    expect(calls).toEqual([{ args: [actor(), NOTE_ID], method: name }]);
  });

  // §7 case 23
  it("is 404 NoteNotFound for somebody else's note, naming only the id sent", async () => {
    const { app } = appAs(actor(), {
      get: (_who, id) => {
        throw new NoteNotFound({ id });
      },
    });

    const res = await send(app, "GET", `/notes/${NOTE_ID}`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      _tag: "NoteNotFound",
      details: { id: NOTE_ID },
    });
  });

  it("is 409 NoteTrashed to PATCH a trashed note", async () => {
    const { app } = appAs(actor(), {
      update: (_who, id) => {
        throw new NoteTrashed({ id });
      },
    });

    const res = await send(app, "PATCH", `/notes/${NOTE_ID}`, { title: "New" });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ _tag: "NoteTrashed" });
  });

  // §7 case 24: the param schema refuses before anything is looked up.
  it.each([
    ["GET", "/notes/not-an-id"],
    ["PATCH", "/notes/not-an-id"],
    ["POST", "/notes/not-an-id/trash"],
    ["POST", "/notes/not-an-id/restore"],
  ])("is 422, not 404, for %s %s", async (method, path) => {
    const { app, calls } = appAs(actor());

    const res = await send(
      app,
      method,
      path,
      method === "PATCH" ? { title: "New" } : undefined
    );

    expect(res.status).toBe(422);
    expect(calls).toEqual([]);
  });
});
