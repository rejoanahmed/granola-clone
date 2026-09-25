import * as Shapes from "@gc/domain/Domain/Folder";
import { isAppError, ValidationFailed } from "@gc/domain/Errors";
import * as FolderErrors from "@gc/domain/Folders/Errors";
import { NoteNotFound, NoteTrashed } from "@gc/domain/Notes/Errors";
import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";
import { actor } from "../Testing";
// @ts-expect-error phase 9: the folders router is specified (phase-9.md §6.1, §11 API 3), not built
import { foldersRouter } from "./Http";

// docs/spec/phase-9.md §7 "Folders/Folders.http.test.ts". Wire shape only: the paths, `c.var.svc`,
// the contract's validation and the statuses. Rules are `Folders.test.ts`. The parent app mirrors
// `apps/api/src/app.ts` in the zod hook and in an `onError` that honours an `AppError`'s status.

type ErrorClass = new (details?: Record<string, unknown>) => Error;
type Schema = { safeParse: (value: unknown) => { success: boolean } };

const FOLDER_ID = "fld_0000000000000001";
const NOTE_ID = "not_0000000000000001";
const AT = 1_700_000_000_000;

const FOLDER = {
  createdAt: AT,
  id: FOLDER_ID,
  name: "Research",
  noteCount: 0,
  updatedAt: AT,
};

type Call = { readonly args: readonly unknown[]; readonly method: string };
type Answers = Partial<Record<string, (...args: unknown[]) => unknown>>;

const errorOf = (tag: string): ErrorClass => {
  const found = (FolderErrors as Record<string, ErrorClass | undefined>)[tag];
  if (found === undefined) {
    throw new Error(`no ${tag} in @gc/domain/Folders/Errors`);
  }
  return found;
};

const schemaOf = (name: string): Schema => {
  const found = (Shapes as unknown as Record<string, Schema | undefined>)[name];
  if (found === undefined) {
    throw new Error(`no ${name} in @gc/domain/Domain/Folder`);
  }
  return found;
};

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
    folders: {
      addNote: method("addNote", { ...FOLDER, noteCount: 1 }),
      create: method("create", FOLDER),
      delete: method("delete", undefined),
      list: method("list", { items: [FOLDER] }),
      removeNote: method("removeNote", FOLDER),
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
  app.route("/", foldersRouter);
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
  ["GET", "/folders", undefined],
  ["POST", "/folders", { name: "Research" }],
  ["DELETE", `/folders/${FOLDER_ID}`, undefined],
  ["POST", `/folders/${FOLDER_ID}/notes`, { noteId: NOTE_ID }],
  ["DELETE", `/folders/${FOLDER_ID}/notes/${NOTE_ID}`, undefined],
] as const;

describe("foldersRouter, anonymous", () => {
  it.each(ROUTES)(
    "is 401 for %s %s and never reaches the service",
    async (verb, path, body) => {
      const { app, calls } = appAs(null);

      const res = await send(app, verb, path, body);

      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ _tag: "Unauthorized" });
      expect(calls).toEqual([]);
    }
  );
});

describe("GET /folders", () => {
  it("answers 200 with a FolderList", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "GET", "/folders");

    expect(res.status).toBe(200);
    expect(schemaOf("FolderList").safeParse(await res.json()).success).toBe(
      true
    );
    expect(calls).toEqual([{ args: [actor()], method: "list" }]);
  });
});

describe("POST /folders", () => {
  it("answers 201 with a Folder, handing the service the parsed body", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", "/folders", { name: " Research " });

    expect(res.status).toBe(201);
    expect(schemaOf("Folder").safeParse(await res.json()).success).toBe(true);
    expect(calls).toEqual([
      { args: [actor(), { name: "Research" }], method: "create" },
    ]);
  });

  it.each([
    ["no name", {}],
    ["a blank name", { name: " " }],
    ["61 characters", { name: "x".repeat(61) }],
    ["an extra key", { extra: true, name: "Research" }],
  ])("is 422 for %s, and never reaches the service", async (_what, body) => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", "/folders", body);

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ _tag: "ValidationFailed" });
    expect(calls).toEqual([]);
  });

  it("is 409 FolderNameTaken for a duplicate, naming the error in the body", async () => {
    const Taken = errorOf("FolderNameTaken");
    const { app } = appAs(actor(), {
      create: () => {
        throw new Taken({ name: "Research" });
      },
    });

    const res = await send(app, "POST", "/folders", { name: "Research" });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ _tag: "FolderNameTaken" });
  });
});

describe("DELETE /folders/{id}", () => {
  it("answers 204 with an empty body", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "DELETE", `/folders/${FOLDER_ID}`);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(calls).toEqual([{ args: [actor(), FOLDER_ID], method: "delete" }]);
  });

  it("is 404 FolderNotFound, naming only the id sent", async () => {
    const Missing = errorOf("FolderNotFound");
    const { app } = appAs(actor(), {
      delete: (_who, id) => {
        throw new Missing({ id });
      },
    });

    const res = await send(app, "DELETE", `/folders/${FOLDER_ID}`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      _tag: "FolderNotFound",
      details: { id: FOLDER_ID },
    });
  });

  it("is 422, not 404, for an id that is not a folder id", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "DELETE", "/folders/not-a-folder");

    expect(res.status).toBe(422);
    expect(calls).toEqual([]);
  });
});

describe("POST /folders/{id}/notes", () => {
  it("answers 200 with the Folder and its new count", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", `/folders/${FOLDER_ID}/notes`, {
      noteId: NOTE_ID,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(schemaOf("Folder").safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ noteCount: 1 });
    expect(calls).toEqual([
      { args: [actor(), FOLDER_ID, NOTE_ID], method: "addNote" },
    ]);
  });

  it("is 404 NoteNotFound for a note that is not the caller's", async () => {
    const { app } = appAs(actor(), {
      addNote: (_who, _folder, id) => {
        throw new NoteNotFound({ id });
      },
    });

    const res = await send(app, "POST", `/folders/${FOLDER_ID}/notes`, {
      noteId: NOTE_ID,
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ _tag: "NoteNotFound" });
  });

  it("is 409 NoteTrashed for a trashed note", async () => {
    const { app } = appAs(actor(), {
      addNote: (_who, _folder, id) => {
        throw new NoteTrashed({ id });
      },
    });

    const res = await send(app, "POST", `/folders/${FOLDER_ID}/notes`, {
      noteId: NOTE_ID,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ _tag: "NoteTrashed" });
  });

  it("is 422 for an extra key, and never reaches the service", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", `/folders/${FOLDER_ID}/notes`, {
      extra: 1,
      noteId: NOTE_ID,
    });

    expect(res.status).toBe(422);
    expect(calls).toEqual([]);
  });
});

describe("DELETE /folders/{id}/notes/{noteId}", () => {
  it("answers 200 with the Folder", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(
      app,
      "DELETE",
      `/folders/${FOLDER_ID}/notes/${NOTE_ID}`
    );

    expect(res.status).toBe(200);
    expect(schemaOf("Folder").safeParse(await res.json()).success).toBe(true);
    expect(calls).toEqual([
      { args: [actor(), FOLDER_ID, NOTE_ID], method: "removeNote" },
    ]);
  });
});
