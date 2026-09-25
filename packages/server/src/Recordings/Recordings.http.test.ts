import { isAppError } from "@gc/domain/Errors";
import * as RecErrors from "@gc/domain/Recordings/Errors";
import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";
import { notesRouter } from "../Notes/Http";
import { actor } from "../Testing";
import * as RecHttp from "./Http";

// docs/spec/phase-5.md §7 "Recordings.http.test.ts": the wire shape once per route. The status
// each route answers with, the verbatim body, the contract's validation, the raw audio handed to
// the service untouched, and no actor meaning no call. The rules behind the 413/415/422 are the
// service's (`Recordings.test.ts`); here they are the service's errors reaching the wire. The notes
// router is mounted too, because `GET /notes/{id}/transcript` is in the Notes contract and served
// by the recordings service. The parent app mirrors `apps/api/src/app.ts` where a status is
// decided, as `Notes.http.test.ts` does.

const REC_ID = "rec_0000000000000001";
const NOTE_ID = "not_0000000000000001";
const AT = 1_700_000_000_000;

const RECORDING = {
  createdAt: AT,
  durationMs: null,
  endedAt: null,
  failure: null,
  id: REC_ID,
  noteId: NOTE_ID,
  privateNotes: "",
  startedAt: AT,
  status: "recording",
  updatedAt: AT,
};

const NOTE = {
  attendees: [
    {
      email: "usr_person_0001@example.test",
      id: "att_0000000000000001",
      isMe: true,
      name: "Person One",
    },
  ],
  bodyMarkdown: "",
  createdAt: AT,
  id: NOTE_ID,
  recording: { durationMs: null, id: REC_ID, status: "recording" },
  source: "phone",
  startedAt: AT,
  title: "Untitled note",
  trashedAt: null,
  updatedAt: AT,
};

const TRANSCRIPT = {
  noteId: NOTE_ID,
  recordingId: REC_ID,
  utterances: [
    { endMs: 1200, speaker: "A", startMs: 0, text: "Hello. How are you?" },
  ],
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
    notes: {},
    recordings: {
      create: method("create", { note: NOTE, recording: RECORDING }),
      discard: method("discard", undefined),
      end: method("end", {
        ...RECORDING,
        durationMs: 12_000,
        endedAt: AT,
        status: "uploading",
      }),
      get: method("get", RECORDING),
      patch: method("patch", { ...RECORDING, privateNotes: "Budget" }),
      retry: method("retry", { ...RECORDING, status: "transcribing" }),
      transcript: method("transcript", TRANSCRIPT),
      uploadAudio: method("uploadAudio", {
        ...RECORDING,
        status: "transcribed",
      }),
    },
  } as unknown as Container;

  const app = new OpenAPIHono<AppEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        return Response.json({ _tag: "ValidationFailed" }, { status: 422 });
      }
    },
  });
  app.use("*", async (c, next) => {
    c.set("actor", who);
    c.set("svc", svc);
    await next();
  });
  app.route("/", RecHttp.recordingsRouter);
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

const SAMPLE = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);

const putAudio = (
  app: OpenAPIHono<AppEnv>,
  contentType = "audio/mp4",
  bytes: Uint8Array = SAMPLE
) =>
  app.request(`/recordings/${REC_ID}/audio`, {
    body: bytes,
    headers: {
      "content-length": String(bytes.byteLength),
      "content-type": contentType,
    },
    method: "PUT",
  });

const ROUTES = [
  ["POST", "/recordings", {}],
  ["GET", `/recordings/${REC_ID}`, undefined],
  ["PATCH", `/recordings/${REC_ID}`, { privateNotes: "x" }],
  ["DELETE", `/recordings/${REC_ID}`, undefined],
  ["POST", `/recordings/${REC_ID}/end`, { durationMs: 12_000 }],
  ["POST", `/recordings/${REC_ID}/retry`, undefined],
  ["GET", `/notes/${NOTE_ID}/transcript`, undefined],
] as const;

describe("the recordings routes, anonymous", () => {
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

  it("is 401 for PUT audio without a session, and never reaches the service", async () => {
    const { app, calls } = appAs(null);

    const res = await putAudio(app);

    expect(res.status).toBe(401);
    expect(calls).toEqual([]);
  });
});

describe("POST /recordings", () => {
  it("creates with a 201 carrying the note and the recording", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", "/recordings", { startedAt: AT });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ note: NOTE, recording: RECORDING });
    expect(calls).toEqual([
      { args: [actor(), { startedAt: AT }], method: "create" },
    ]);
  });

  it("is 422 for a key the body does not own (strict)", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", "/recordings", { status: "failed" });

    expect(res.status).toBe(422);
    expect(calls).toEqual([]);
  });
});

describe("one recording", () => {
  it("reads it at GET /recordings/{id}", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "GET", `/recordings/${REC_ID}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RECORDING);
    expect(calls).toEqual([{ args: [actor(), REC_ID], method: "get" }]);
  });

  it("patches the private notes, and is 422 for a key the patch does not own", async () => {
    const accepted = appAs(actor());
    const good = await send(accepted.app, "PATCH", `/recordings/${REC_ID}`, {
      privateNotes: "Budget",
    });
    expect(good.status).toBe(200);
    expect(accepted.calls).toEqual([
      { args: [actor(), REC_ID, { privateNotes: "Budget" }], method: "patch" },
    ]);

    const refused = appAs(actor());
    const bad = await send(refused.app, "PATCH", `/recordings/${REC_ID}`, {
      privateNotes: "x",
      status: "failed",
    });
    expect(bad.status).toBe(422);
    expect(refused.calls).toEqual([]);
  });

  it("discards with a 204 and no body", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "DELETE", `/recordings/${REC_ID}`);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(calls).toEqual([{ args: [actor(), REC_ID], method: "discard" }]);
  });

  it("ends with a 200, and is 422 for a duration out of range", async () => {
    const accepted = appAs(actor());
    const good = await send(accepted.app, "POST", `/recordings/${REC_ID}/end`, {
      durationMs: 12_000,
    });
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ status: "uploading" });
    expect(accepted.calls).toEqual([
      { args: [actor(), REC_ID, { durationMs: 12_000 }], method: "end" },
    ]);

    const refused = appAs(actor());
    const bad = await send(refused.app, "POST", `/recordings/${REC_ID}/end`, {
      durationMs: 21_600_001,
    });
    expect(bad.status).toBe(422);
    expect(refused.calls).toEqual([]);
  });

  it("retries with a 200, taking no body", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", `/recordings/${REC_ID}/retry`);

    expect(res.status).toBe(200);
    expect(calls).toEqual([{ args: [actor(), REC_ID], method: "retry" }]);
  });

  it.each([
    ["GET", "/recordings/not-an-id"],
    ["DELETE", "/recordings/not-an-id"],
    ["POST", "/recordings/not-an-id/retry"],
  ])("is 422, not 404, for %s %s", async (method, path) => {
    const { app, calls } = appAs(actor());

    const res = await send(app, method, path);

    expect(res.status).toBe(422);
    expect(calls).toEqual([]);
  });

  it.each([
    ["RecordingNotFound", 404],
    ["RecordingNotActive", 409],
    ["RecordingNotRetryable", 409],
  ])("renders %s as a %i", async (tag, status) => {
    const { app } = appAs(actor(), {
      get: (_who, id) => {
        const ErrorClass = (
          RecErrors as Record<string, new (d: object) => Error>
        )[tag];
        if (ErrorClass === undefined) {
          throw new Error(`${tag} is not exported`);
        }
        throw new ErrorClass({ id });
      },
    });

    const res = await send(app, "GET", `/recordings/${REC_ID}`);

    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ _tag: tag, details: { id: REC_ID } });
  });
});

describe("PUT /recordings/{id}/audio", () => {
  it("hands the service the raw body, the content type and the declared length, and answers 200", async () => {
    const { app, calls } = appAs(actor());

    const res = await putAudio(app);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "transcribed" });
    expect(calls).toHaveLength(1);
    const [who, id, input] = calls[0]?.args ?? [];
    expect(who).toEqual(actor());
    expect(id).toBe(REC_ID);
    expect(input).toMatchObject({
      contentLength: String(SAMPLE.byteLength),
      contentType: "audio/mp4",
    });
    const body = (input as { body: ReadableStream<Uint8Array> }).body;
    expect(new Uint8Array(await new Response(body).arrayBuffer())).toEqual(
      SAMPLE
    );
  });

  it.each([
    ["AudioTooLarge", 413],
    ["AudioLengthRequired", 411],
    ["AudioLengthMismatch", 400],
    ["UnsupportedAudioType", 415],
    ["EmptyAudio", 422],
    ["RecordingNotUploading", 409],
  ])("renders %s as a %i", async (tag, status) => {
    const { app } = appAs(actor(), {
      uploadAudio: (_who, id) => {
        const ErrorClass = (
          RecErrors as Record<string, new (d: object) => Error>
        )[tag];
        if (ErrorClass === undefined) {
          throw new Error(`${tag} is not exported`);
        }
        throw new ErrorClass({ id });
      },
    });

    const res = await putAudio(app, "image/png");

    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ _tag: tag });
  });
});

describe("GET /notes/{id}/transcript", () => {
  it("answers the transcript from the recordings service", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "GET", `/notes/${NOTE_ID}/transcript`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(TRANSCRIPT);
    expect(calls).toEqual([{ args: [actor(), NOTE_ID], method: "transcript" }]);
  });

  it("is 404 TranscriptNotFound when there is none yet", async () => {
    const { app } = appAs(actor(), {
      transcript: (_who, id) => {
        throw new RecErrors.TranscriptNotFound({ id });
      },
    });

    const res = await send(app, "GET", `/notes/${NOTE_ID}/transcript`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      _tag: "TranscriptNotFound",
      details: { id: NOTE_ID },
    });
  });
});

// ── Phase 11: POST /recordings from a meeting (docs/spec/phase-11.md §6.1, §7 case 21) ─────────────
// The body gains `calendarEventId`; the service's two new refusals reach the wire with their
// status. The error classes do not exist yet, so they are imported inside the block and the phase 5
// cases above keep running.

describe("POST /recordings with a calendar event, phase 11", () => {
  type ErrorClass = new (details: object) => Error;

  const calendarError = async (name: string): Promise<ErrorClass> => {
    const errors = (await import("@gc/domain/Calendar/Errors")) as Record<
      string,
      ErrorClass | undefined
    >;
    const found = errors[name];
    if (found === undefined) {
      throw new Error(`no ${name} in @gc/domain/Calendar/Errors`);
    }
    return found;
  };

  it("hands the service the event id with the start", async () => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", "/recordings", {
      calendarEventId: "cev_e2e_person_2",
      startedAt: AT,
    });

    expect(res.status).toBe(201);
    expect(calls).toEqual([
      {
        args: [actor(), { calendarEventId: "cev_e2e_person_2", startedAt: AT }],
        method: "create",
      },
    ]);
  });

  it.each([
    ["a malformed id", { calendarEventId: "bad id!" }],
    ["a key the body does not own", { calendarEventId: "cev_1", extra: 1 }],
  ])("is 422 for %s, and never reaches the service", async (_, body) => {
    const { app, calls } = appAs(actor());

    const res = await send(app, "POST", "/recordings", body);

    expect(res.status).toBe(422);
    expect(calls).toEqual([]);
  });

  it("is 404 CalendarEventNotFound for an event no longer on the calendar", async () => {
    const NotFound = await calendarError("CalendarEventNotFound");
    const { app } = appAs(actor(), {
      create: () =>
        Promise.reject(new NotFound({ calendarEventId: "cev_gone" })),
    });

    const res = await send(app, "POST", "/recordings", {
      calendarEventId: "cev_gone",
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      _tag: "CalendarEventNotFound",
      details: { calendarEventId: "cev_gone" },
    });
  });

  it("is 409 CalendarEventHasNote carrying the note it already has", async () => {
    const HasNote = await calendarError("CalendarEventHasNote");
    const { app } = appAs(actor(), {
      create: () =>
        Promise.reject(
          new HasNote({ calendarEventId: "cev_1", noteId: NOTE_ID })
        ),
    });

    const res = await send(app, "POST", "/recordings", {
      calendarEventId: "cev_1",
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      _tag: "CalendarEventHasNote",
      details: { calendarEventId: "cev_1", noteId: NOTE_ID },
    });
  });

  it("is 503 CalendarUnavailable when the calendar is down", async () => {
    const Unavailable = await calendarError("CalendarUnavailable");
    const { app } = appAs(actor(), {
      create: () => Promise.reject(new Unavailable({})),
    });

    const res = await send(app, "POST", "/recordings", {
      calendarEventId: "cev_1",
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ _tag: "CalendarUnavailable" });
  });
});
