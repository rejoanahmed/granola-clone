import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { makeSessions } from "../Auth/Sessions";
import { buildContainer } from "../container";
import { makeDrizzle } from "../Runtime/Drizzle";
import type { Env } from "../Runtime/WorkerEnv";
import { makeTestD1, type TestD1 } from "../Testing/Database";
import type { E2eService } from "./E2eService";
import { E2E_USERS, type E2eUser } from "./Fixtures";

const AUTH_SECRET = "auth-secret-32-characters-long-000000";

// The whole graph over a migrated SQLite, not a double: the harness writes better-auth's own
// tables, and a mock would agree with whatever this file assumed about them.
const envOver = (d1: TestD1) =>
  ({
    API_URL: "http://localhost:3001",
    BETTER_AUTH_SECRET: AUTH_SECRET,
    BETTER_AUTH_URL: "http://localhost:3001",
    DB: d1,
    E2E_HARNESS: "true",
    E2E_SECRET: "e2e-secret-long-enough-to-be-accepted",
    FLAGS_MODE: "fake",
    NATIVE_SCHEME: "kothanote",
    NODE_ENV: "test",
  }) satisfies Env;

describe("the E2E harness", () => {
  let d1: TestD1;
  let harness: E2eService;

  beforeAll(() => {
    d1 = makeTestD1();
    const built = buildContainer(envOver(d1)).e2e;
    if (built === null) {
      throw new Error("an armed configuration built no harness");
    }
    harness = built;
  });

  it("seeds the same world after a reset, and seeding twice is a no-op", async () => {
    const first = await harness.seed();
    await harness.reset();
    await harness.seed();
    const again = await harness.seed();

    expect(again).toEqual(first);
  });

  it("mints a session cookie better-auth itself accepts", async () => {
    const minted = await harness.signIn("person", "http://localhost:3001");

    const sessions = makeSessions({
      db: makeDrizzle(d1),
      email: { sendOtpEmail: () => Promise.resolve() },
      nativeScheme: "kothanote",
      secret: AUTH_SECRET,
      trustedOrigins: ["http://localhost:3001"],
    });
    const actor = await sessions.resolveActor(
      new Request("http://localhost:3001/me", {
        headers: { cookie: `${minted.cookie.name}=${minted.cookie.value}` },
      })
    );

    expect(actor?.id).toBe(minted.user.id);
  });

  it("names the cookie the way the origin it was asked for does", async () => {
    const local = await harness.signIn("person", "http://localhost:3001");
    const deployed = await harness.signIn(
      "person",
      "https://api-dev.kothanote.example.com"
    );

    expect(local.cookie.name).toBe("better-auth.session_token");
    expect(deployed.cookie.name).toBe("__Secure-better-auth.session_token");
  });

  it("refuses a role it does not know rather than inventing a user", async () => {
    await expect(
      harness.signIn("administrator", "http://localhost:3001")
    ).rejects.toMatchObject({ _tag: "ValidationFailed" });
  });
});

// ── Phase 4: the notes fixtures and the `empty` person (docs/spec/phase-4.md §6.6, §7 cases 25–27) ──

const FIXTURE_IDS = [
  "not_e2e_archived",
  "not_e2e_launch",
  "not_e2e_other",
  "not_e2e_solo",
  "not_e2e_standup",
];

describe("the E2E harness, phase 4", () => {
  let d1: TestD1;
  let container: ReturnType<typeof buildContainer>;
  let harness: E2eService;

  beforeAll(() => {
    d1 = makeTestD1();
    container = buildContainer(envOver(d1));
    if (container.e2e === null) {
      throw new Error("an armed configuration built no harness");
    }
    harness = container.e2e;
  });

  const fresh = async () => {
    await harness.reset();
    return await harness.seed();
  };

  const countOf = async (table: string): Promise<number> =>
    Number(await d1.prepare(`SELECT count(*) AS n FROM ${table}`).first("n"));

  // §7 case 25
  it("seeds the five fixtures with their fixed ids, and names them in its answer", async () => {
    const seeded = await fresh();

    const rows = await d1
      .prepare("SELECT id FROM notes ORDER BY id")
      .all<{ id: string }>();
    expect(rows.results.map((row) => row.id)).toEqual(FIXTURE_IDS);
    type Named = { id: string; ownerRole: string; title: string };
    const named: Named[] = seeded.notes;
    expect([...named].sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      {
        id: "not_e2e_archived",
        ownerRole: "person",
        title: "Archived kickoff",
      },
      {
        id: "not_e2e_launch",
        ownerRole: "person",
        title: "Launch planning review",
      },
      {
        id: "not_e2e_other",
        ownerRole: "other",
        title: "Other person\u2019s private note",
      },
      {
        id: "not_e2e_solo",
        ownerRole: "person",
        title: "Solo reflection thoughts",
      },
      { id: "not_e2e_standup", ownerRole: "person", title: "Weekly standup" },
    ]);
  });

  it("lists exactly person's three live notes, newest first", async () => {
    await fresh();

    const page = await container.notes.list(E2E_USERS.person, {
      cursor: null,
      limit: 20,
    });

    expect(page.items.map((item: { id: string }) => item.id)).toEqual([
      "not_e2e_launch",
      "not_e2e_standup",
      "not_e2e_solo",
    ]);
  });

  // §7 case 26
  it("seeds an onboarded `empty` person who has no notes", async () => {
    await fresh();
    const empty = E2E_USERS.empty;
    expect(empty).toEqual({
      email: "e2e-empty@kothanote.test",
      id: "usr_e2e_empty",
      name: "E2E Empty",
    });

    const page = await container.notes.list(empty, { cursor: null, limit: 20 });
    const profile = await container.profiles.me(empty);

    expect(page).toEqual({ items: [], nextCursor: null });
    expect(profile.onboardedAt).toEqual(expect.any(Number));
  });

  it("seeds over an address better-auth already signed up under another id", async () => {
    await harness.reset();
    await d1
      .prepare("DELETE FROM user WHERE id = ?")
      .bind(E2E_USERS.empty.id)
      .run();
    await d1
      .prepare(
        "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, 0, 0)"
      )
      .bind("usr_signed_up_by_a_flow", "Stray", E2E_USERS.empty.email)
      .run();

    await harness.seed();

    const rows = await d1
      .prepare("SELECT id FROM user WHERE email = ?")
      .bind(E2E_USERS.empty.email)
      .all<{ id: string }>();
    expect(rows.results.map((row) => row.id)).toEqual([E2E_USERS.empty.id]);
    const profile = await container.profiles.me(E2E_USERS.empty);
    expect(profile.onboardedAt).toEqual(expect.any(Number));
  });

  // §7 case 27
  it("leaves no notes or attendees after a reset, and a re-seed restores a renamed fixture", async () => {
    await fresh();
    await container.notes.update(E2E_USERS.person, "not_e2e_launch", {
      title: "Renamed by a journey",
    });

    await harness.reset();
    expect(await countOf("notes")).toBe(0);
    expect(await countOf("note_attendees")).toBe(0);

    await harness.seed();
    const restored = await container.notes.get(
      E2E_USERS.person,
      "not_e2e_launch"
    );
    expect(restored).toMatchObject({ title: "Launch planning review" });
    expect(restored.attendees).toHaveLength(3);
  });

  // A flow renames e2e-person through better-auth's update-user; `user` survives a reset, so the
  // seed is what must put the name (and a photo) back, on the same id a minted session names.
  it("restores a seeded person's name and image on re-seed, keeping their id", async () => {
    await fresh();
    await d1
      .prepare("UPDATE user SET name = ?, image = ? WHERE id = ?")
      .bind("Riley Park", "https://img.example/riley.png", E2E_USERS.person.id)
      .run();

    await fresh();

    const row = await d1
      .prepare("SELECT id, name, image FROM user WHERE email = ?")
      .bind(E2E_USERS.person.email)
      .first<{ id: string; image: string | null; name: string }>();
    expect(row).toEqual({
      id: E2E_USERS.person.id,
      image: null,
      name: E2E_USERS.person.name,
    });
  });
});

// ── Phase 5: seeded transcripts and the transcription switch (docs/spec/phase-5.md §6.4, §7) ──
//
// Read through loose views of the container and the harness: neither has its phase-5 members yet,
// and a cast through `unknown` keeps this file compiling on both sides of that change.

type Utterance = { readonly speaker: string; readonly text: string };
type RecordingView = { readonly id: string; readonly status: string };
type RecordingsView = {
  create: (
    who: E2eUser,
    input: object
  ) => Promise<{ recording: RecordingView }>;
  end: (
    who: E2eUser,
    id: string,
    input: { durationMs: number }
  ) => Promise<RecordingView>;
  get: (who: E2eUser, id: string) => Promise<RecordingView>;
  transcript: (
    who: E2eUser,
    noteId: string
  ) => Promise<{ utterances: readonly Utterance[] }>;
  uploadAudio: (
    who: E2eUser,
    id: string,
    upload: {
      body: ReadableStream<Uint8Array>;
      contentLength: string;
      contentType: string;
    }
  ) => Promise<RecordingView>;
};
type HarnessView = {
  releaseTranscription: () => Promise<{
    completed: number;
    failed: number;
    pending: number;
  }>;
  setTranscriptionMode: (mode: string) => Promise<{ mode: string }>;
};

// Enough of R2 for the audio store: what was put is kept, bytes and all.
const memoryBucket = () => {
  const objects = new Map<string, Uint8Array>();
  const bytesOf = async (value: unknown): Promise<Uint8Array> =>
    new Uint8Array(await new Response(value as BodyInit).arrayBuffer());
  return {
    delete: (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        objects.delete(key);
      }
      return Promise.resolve();
    },
    get: (key: string) => {
      const bytes = objects.get(key);
      return Promise.resolve(
        bytes === undefined
          ? null
          : {
              arrayBuffer: () => Promise.resolve(bytes.buffer),
              body: new Blob([bytes]).stream(),
              key,
              size: bytes.byteLength,
            }
      );
    },
    head: (key: string) =>
      Promise.resolve(
        objects.has(key)
          ? { key, size: objects.get(key)?.byteLength ?? 0 }
          : null
      ),
    objects,
    put: async (key: string, value: unknown) => {
      objects.set(key, await bytesOf(value));
      return { key };
    },
  };
};

describe("the E2E harness, phase 5", () => {
  let d1: TestD1;
  let container: ReturnType<typeof buildContainer>;
  let harness: E2eService;

  beforeAll(() => {
    d1 = makeTestD1();
    container = buildContainer({
      ...envOver(d1),
      AUDIO: memoryBucket(),
    } as unknown as Env);
    if (container.e2e === null) {
      throw new Error("an armed configuration built no harness");
    }
    harness = container.e2e;
  });

  const recordings = () =>
    (container as unknown as { recordings: RecordingsView }).recordings;
  const switches = () => harness as unknown as HarnessView;

  const fresh = async () => {
    await harness.reset();
    return await harness.seed();
  };

  it("gives not_e2e_launch a transcript of at least 8 utterances, A and B in turn, A first", async () => {
    await fresh();

    const { utterances } = await recordings().transcript(
      E2E_USERS.person,
      "not_e2e_launch"
    );

    expect(utterances.length).toBeGreaterThanOrEqual(8);
    expect(utterances[0]?.speaker).toBe("A");
    expect(new Set(utterances.map((u) => u.speaker))).toEqual(
      new Set(["A", "B"])
    );
    utterances.forEach((utterance, index) => {
      expect(utterance.speaker).toBe(index % 2 === 0 ? "A" : "B");
    });
  });

  it("gives not_e2e_solo exactly one utterance: A, “Hello. How are you?” (#42)", async () => {
    await fresh();

    const { utterances } = await recordings().transcript(
      E2E_USERS.person,
      "not_e2e_solo"
    );

    expect(utterances).toEqual([
      expect.objectContaining({ speaker: "A", text: "Hello. How are you?" }),
    ]);
  });

  it("gives not_e2e_other a transcript only its owner can read, and not_e2e_standup none", async () => {
    await fresh();

    await expect(
      recordings().transcript(E2E_USERS.other, "not_e2e_other")
    ).resolves.toMatchObject({ utterances: expect.any(Array) });
    await expect(
      recordings().transcript(E2E_USERS.person, "not_e2e_other")
    ).rejects.toMatchObject({ _tag: "NoteNotFound" });
    await expect(
      recordings().transcript(E2E_USERS.person, "not_e2e_standup")
    ).rejects.toMatchObject({ _tag: "TranscriptNotFound" });
  });

  it("marks the seeded recordings transcribed on the notes list", async () => {
    await fresh();

    const page = await container.notes.list(E2E_USERS.person, {
      cursor: null,
      limit: 20,
    });

    expect(
      page.items.map((item) => ({
        id: item.id,
        recordingStatus: (item as { recordingStatus?: unknown })
          .recordingStatus,
      }))
    ).toEqual([
      { id: "not_e2e_launch", recordingStatus: "transcribed" },
      { id: "not_e2e_standup", recordingStatus: null },
      { id: "not_e2e_solo", recordingStatus: "transcribed" },
    ]);
  });

  it("answers the mode it set, and a reset clears the switch", async () => {
    await fresh();

    await expect(switches().setTranscriptionMode("hold")).resolves.toEqual({
      mode: "hold",
    });
    expect(
      Number(
        await d1.prepare("SELECT count(*) AS n FROM e2e_switches").first("n")
      )
    ).toBe(1);

    await harness.reset();
    expect(
      Number(
        await d1.prepare("SELECT count(*) AS n FROM e2e_switches").first("n")
      )
    ).toBe(0);
  });

  it("refuses a mode it does not know", async () => {
    await expect(
      switches().setTranscriptionMode("sometimes")
    ).rejects.toMatchObject({ _tag: "ValidationFailed" });
  });

  it("releases a held recording: the switch goes to auto and the sweep completes it", async () => {
    await fresh();
    await switches().setTranscriptionMode("hold");
    const person = E2E_USERS.person;
    const { recording } = await recordings().create(person, {});
    await recordings().end(person, recording.id, { durationMs: 12_000 });
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    const held = await recordings().uploadAudio(person, recording.id, {
      body: new Blob([bytes]).stream(),
      contentLength: String(bytes.byteLength),
      contentType: "audio/mp4",
    });
    expect(held.status).toBe("transcribing");

    const released = await switches().releaseTranscription();

    expect(released).toEqual({ completed: 1, failed: 0, pending: 0 });
    await expect(recordings().get(person, recording.id)).resolves.toMatchObject(
      { status: "transcribed" }
    );
  });
});

// ── Phase 6: seeded generations and the LLM switch (docs/spec/phase-6.md §6.3, §6.6, §7) ──────
//
// Read through loose views again: the container has no `generations` and the harness no LLM
// switch yet. `GENERATION_QUEUE` is a recording stand-in for the producer binding, so an upload
// that settles can enqueue; nothing consumes it, which is exactly the local-queue timing these
// harness routes exist to take out of a flow.

type GenerationView = {
  readonly failure: string | null;
  readonly status: string;
};
type NoteView = {
  readonly bodyMarkdown: string;
  readonly generation: GenerationView | null;
  readonly title: string;
};
type InlineCounts = { done: number; failed: number; pending: number };
type HarnessP6 = HarnessView & {
  releaseLlm: () => Promise<InlineCounts>;
  runLlm: (times: unknown) => Promise<unknown>;
  setLlmMode: (mode: unknown) => Promise<{ mode: string }>;
};
type GenerationsView = { run: (generationId: string) => Promise<string> };

const memoryQueue = () => {
  const sent: unknown[] = [];
  return {
    send: (body: unknown) => {
      sent.push(body);
      return Promise.resolve();
    },
    sendBatch: (messages: readonly { body: unknown }[]) => {
      for (const message of messages) {
        sent.push(message.body);
      }
      return Promise.resolve();
    },
    sent,
  };
};

describe("the E2E harness, phase 6", () => {
  let d1: TestD1;
  let container: ReturnType<typeof buildContainer>;
  let harness: E2eService;

  beforeAll(() => {
    d1 = makeTestD1();
    container = buildContainer({
      ...envOver(d1),
      AUDIO: memoryBucket(),
      GENERATION_QUEUE: memoryQueue(),
    } as unknown as Env);
    if (container.e2e === null) {
      throw new Error("an armed configuration built no harness");
    }
    harness = container.e2e;
  });

  const recordings = () =>
    (container as unknown as { recordings: RecordingsView }).recordings;
  const generations = () =>
    (container as unknown as { generations: GenerationsView }).generations;
  const switches = () => harness as unknown as HarnessP6;
  const noteOf = async (noteId: string): Promise<NoteView> =>
    (await container.notes.get(
      E2E_USERS.person,
      noteId
    )) as unknown as NoteView;

  const fresh = async () => {
    await harness.reset();
    return await harness.seed();
  };

  // A new recording of 12 s, taken as far as the transcriber's current mode lets it go.
  const recorded = async () => {
    const person = E2E_USERS.person;
    const { recording } = await recordings().create(person, {});
    await recordings().end(person, recording.id, { durationMs: 12_000 });
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
    const uploaded = await recordings().uploadAudio(person, recording.id, {
      body: new Blob([bytes]).stream(),
      contentLength: String(bytes.byteLength),
      contentType: "audio/mp4",
    });
    const note = await d1
      .prepare("SELECT note_id AS id FROM recordings WHERE id = ?")
      .bind(recording.id)
      .first("id");
    return { noteId: String(note), status: uploaded.status };
  };

  const generationIdOf = async (noteId: string): Promise<string> =>
    String(
      await d1
        .prepare("SELECT id FROM note_generations WHERE note_id = ?")
        .bind(noteId)
        .first("id")
    );

  it("gives the three seeded recordings a generated row, and the typed standup none", async () => {
    await fresh();

    const rows = await d1
      .prepare(
        "SELECT note_id, recording_id, status, failure FROM note_generations ORDER BY recording_id"
      )
      .all();

    expect(rows.results).toEqual([
      {
        failure: null,
        note_id: "not_e2e_launch",
        recording_id: "rec_e2e_launch",
        status: "generated",
      },
      {
        failure: null,
        note_id: "not_e2e_other",
        recording_id: "rec_e2e_other",
        status: "generated",
      },
      {
        failure: null,
        note_id: "not_e2e_solo",
        recording_id: "rec_e2e_solo",
        status: "generated",
      },
    ]);
    await expect(noteOf("not_e2e_launch")).resolves.toMatchObject({
      generation: { failure: null, status: "generated" },
      title: "Launch planning review",
    });
    await expect(noteOf("not_e2e_standup")).resolves.toMatchObject({
      generation: null,
    });
  });

  it("answers the LLM mode it set, stores it as the llm switch, and a reset clears it", async () => {
    await fresh();

    await expect(switches().setLlmMode("hold")).resolves.toEqual({
      mode: "hold",
    });
    expect(
      (
        await d1
          .prepare("SELECT name, value FROM e2e_switches WHERE name = 'llm'")
          .all()
      ).results
    ).toEqual([{ name: "llm", value: "hold" }]);

    await harness.reset();
    expect(
      Number(
        await d1.prepare("SELECT count(*) AS n FROM e2e_switches").first("n")
      )
    ).toBe(0);
  });

  it.each(["auto", "hold", "fail", "malformed", "truncated"])(
    "accepts the LLM mode %s",
    async (mode) => {
      await expect(switches().setLlmMode(mode)).resolves.toEqual({ mode });
    }
  );

  it("refuses an LLM mode it does not know", async () => {
    await expect(switches().setLlmMode("sometimes")).rejects.toMatchObject({
      _tag: "ValidationFailed",
    });
  });

  it("releases a held generation: the switch goes to auto and the job runs inline", async () => {
    await fresh();
    await switches().setLlmMode("hold");
    const { noteId, status } = await recorded();
    expect(status).toBe("transcribed");
    await generations().run(await generationIdOf(noteId));
    await expect(noteOf(noteId)).resolves.toMatchObject({
      generation: { status: "queued" },
      title: "Untitled note",
    });

    const released = await switches().releaseLlm();

    expect(released).toEqual({ done: 1, failed: 0, pending: 0 });
    await expect(noteOf(noteId)).resolves.toMatchObject({
      generation: { failure: null, status: "generated" },
      title: "Brief check-in",
    });
    expect(
      await d1
        .prepare("SELECT value FROM e2e_switches WHERE name = 'llm'")
        .first("value")
    ).toBe("auto");
  });

  it("spends one attempt per llm/run pass: three in fail end failed / llm_unavailable", async () => {
    await fresh();
    await switches().setLlmMode("fail");
    const { noteId } = await recorded();

    await switches().runLlm(3);

    await expect(noteOf(noteId)).resolves.toMatchObject({
      generation: { failure: "llm_unavailable", status: "failed" },
      title: "Untitled note",
    });
    expect(
      await d1
        .prepare("SELECT value FROM e2e_switches WHERE name = 'llm'")
        .first("value")
    ).toBe("fail");
  });

  it("leaves one pass in fail short of failing", async () => {
    await fresh();
    await switches().setLlmMode("fail");
    const { noteId } = await recorded();

    await switches().runLlm(1);

    await expect(noteOf(noteId)).resolves.toMatchObject({
      generation: { failure: null, status: "queued" },
    });
  });

  it.each([0, 6, "three", undefined])(
    "refuses llm/run with times %s",
    async (times) => {
      await expect(switches().runLlm(times)).rejects.toMatchObject({
        _tag: "ValidationFailed",
      });
    }
  );

  it("finishes a held transcription through to a generated note when the LLM is in auto", async () => {
    await fresh();
    await switches().setTranscriptionMode("hold");
    const { noteId, status } = await recorded();
    expect(status).toBe("transcribing");

    await switches().releaseTranscription();

    await expect(noteOf(noteId)).resolves.toMatchObject({
      generation: { status: "generated" },
      title: "Brief check-in",
    });
  });
});

// ── Phase 7: the chat fixtures and the chat switch (docs/spec/phase-7.md §6.3, §6.6) ─────────
// `E2E_CHATS` and the harness's chat members do not exist yet, so they are read through casts.

type ChatHarness = {
  releaseChat: () => Promise<{ mode: string }>;
  setChatMode: (mode: unknown) => Promise<{ mode: string }>;
};

describe("the E2E harness, phase 7", () => {
  let d1: TestD1;
  let harness: E2eService;

  beforeAll(() => {
    d1 = makeTestD1();
    const container = buildContainer(envOver(d1));
    if (container.e2e === null) {
      throw new Error("an armed configuration built no harness");
    }
    harness = container.e2e;
  });

  const switches = () => harness as unknown as ChatHarness;

  const fresh = async () => {
    await harness.reset();
    return await harness.seed();
  };

  const rows = async (sql: string) => (await d1.prepare(sql).all()).results;

  const chatSwitch = async () =>
    await rows("SELECT name, value FROM e2e_switches WHERE name = 'chat'");

  it("seeds the three threads with their fixed ids, owners, scopes and instants", async () => {
    await fresh();

    expect(
      await rows(
        "SELECT id, owner_id, pinned_at, scope_kind, scope_note_id, title, updated_at FROM chat_threads ORDER BY id"
      )
    ).toEqual([
      {
        id: "cht_e2e_cohort",
        owner_id: "usr_e2e_person",
        pinned_at: null,
        scope_kind: "global",
        scope_note_id: null,
        title: "Beta cohort size",
        updated_at: Date.UTC(2026, 8, 12, 14),
      },
      {
        id: "cht_e2e_other",
        owner_id: "usr_e2e_other",
        pinned_at: null,
        scope_kind: "global",
        scope_note_id: null,
        title: "Other person’s chat",
        updated_at: Date.UTC(2026, 8, 12, 9),
      },
      {
        id: "cht_e2e_solo",
        owner_id: "usr_e2e_person",
        pinned_at: null,
        scope_kind: "note",
        scope_note_id: "not_e2e_solo",
        title: "Solo note recap",
        updated_at: Date.UTC(2026, 7, 5, 12),
      },
    ]);
  });

  it("seeds each thread a question and a complete answer, citing the launch note for cohort", async () => {
    await fresh();

    const messages = await rows(
      "SELECT thread_id, position, role, status, content, citations, model FROM chat_messages ORDER BY thread_id, position"
    );

    expect(
      messages.map((row) => [row.thread_id, row.role, row.status])
    ).toEqual([
      ["cht_e2e_cohort", "user", "complete"],
      ["cht_e2e_cohort", "assistant", "complete"],
      ["cht_e2e_other", "user", "complete"],
      ["cht_e2e_other", "assistant", "complete"],
      ["cht_e2e_solo", "user", "complete"],
      ["cht_e2e_solo", "assistant", "complete"],
    ]);
    expect(messages[0]?.content).toBe("How many teams are in the beta cohort?");
    expect(messages[1]?.content).toBe(
      "The beta cohort is **forty teams** across three regions [1]."
    );
    expect(messages[1]?.model).toBe("auto");
    expect(JSON.parse(String(messages[1]?.citations))).toEqual([
      expect.objectContaining({ index: 1, noteId: "not_e2e_launch" }),
    ]);
    expect(messages[4]?.content).toBe("What did I say?");
  });

  it("seeds no chat preference, so person's model is Auto", async () => {
    await fresh();

    expect(await rows("SELECT user_id FROM chat_preferences")).toEqual([]);
  });

  it("seeds the same threads twice without a second copy", async () => {
    await fresh();
    await harness.seed();

    expect(await rows("SELECT id FROM chat_threads ORDER BY id")).toEqual([
      { id: "cht_e2e_cohort" },
      { id: "cht_e2e_other" },
      { id: "cht_e2e_solo" },
    ]);
  });

  it("answers the chat mode it set, and stores it as the chat switch", async () => {
    await fresh();

    for (const mode of ["hold", "fail", "auto"]) {
      // biome-ignore lint/performance/noAwaitInLoops: each mode overwrites the one before
      await expect(switches().setChatMode(mode)).resolves.toEqual({ mode });
    }
    await switches().setChatMode("hold");

    expect(await chatSwitch()).toEqual([{ name: "chat", value: "hold" }]);
  });

  it.each(["sometimes", "malformed", "", undefined])(
    "refuses the chat mode %s",
    async (mode) => {
      await expect(switches().setChatMode(mode)).rejects.toMatchObject({
        _tag: "ValidationFailed",
      });
    }
  );

  it("releases: the chat switch back to auto", async () => {
    await fresh();
    await switches().setChatMode("hold");

    await expect(switches().releaseChat()).resolves.toEqual({ mode: "auto" });

    expect(await chatSwitch()).toEqual([{ name: "chat", value: "auto" }]);
  });

  it("clears the switch and every thread on reset, a thread a flow created included", async () => {
    await fresh();
    await switches().setChatMode("fail");
    await d1
      .prepare(
        "INSERT INTO chat_threads (id, owner_id, scope_kind, title, created_at, updated_at) VALUES ('cht_made_by_a_flow', 'usr_e2e_person', 'global', 'Made', 0, 0)"
      )
      .run();
    await d1
      .prepare(
        "INSERT INTO chat_preferences (user_id, model, updated_at) VALUES ('usr_e2e_person', 'balanced', 0)"
      )
      .run();

    await harness.reset();

    expect(await chatSwitch()).toEqual([]);
    expect(await rows("SELECT id FROM chat_threads")).toEqual([]);
    expect(await rows("SELECT id FROM chat_messages")).toEqual([]);
    expect(await rows("SELECT user_id FROM chat_preferences")).toEqual([]);
  });
});

// ── Phase 9: the folder fixtures (docs/spec/phase-9.md §6.5, §7 "E2E/E2E.test.ts") ─────────────
// The base seed gives `other` one folder, so ownership can be proven, and `person` none, so the empty
// drawer and sheet are reachable. `seedFolders()` (behind `POST /e2e/folders`) writes person's two.

type FolderHarness = { seedFolders: () => Promise<unknown> };

describe("the E2E harness, phase 9", () => {
  let d1: TestD1;
  let harness: E2eService;

  beforeAll(() => {
    d1 = makeTestD1();
    const container = buildContainer(envOver(d1));
    if (container.e2e === null) {
      throw new Error("an armed configuration built no harness");
    }
    harness = container.e2e;
  });

  const folders = () => harness as unknown as FolderHarness;

  const fresh = async () => {
    await harness.reset();
    return await harness.seed();
  };

  const rows = async (sql: string) => (await d1.prepare(sql).all()).results;

  const folderRows = () =>
    rows("SELECT id, name, name_key, owner_id FROM folders ORDER BY id");
  const memberRows = () =>
    rows(
      "SELECT folder_id, note_id FROM folder_notes ORDER BY folder_id, note_id"
    );

  const OTHERS_FOLDER = {
    id: "fld_e2e_other",
    name: "Other’s folder",
    name_key: "other’s folder",
    owner_id: "usr_e2e_other",
  };

  it("gives person no folders in the base seed, and other one holding their note", async () => {
    await fresh();

    expect(await folderRows()).toEqual([OTHERS_FOLDER]);
    expect(await memberRows()).toEqual([
      { folder_id: "fld_e2e_other", note_id: "not_e2e_other" },
    ]);
  });

  it("writes person's Personal and Product with their members, at fixed instants", async () => {
    await fresh();

    await folders().seedFolders();

    expect(await folderRows()).toEqual([
      OTHERS_FOLDER,
      {
        id: "fld_e2e_personal",
        name: "Personal",
        name_key: "personal",
        owner_id: "usr_e2e_person",
      },
      {
        id: "fld_e2e_product",
        name: "Product",
        name_key: "product",
        owner_id: "usr_e2e_person",
      },
    ]);
    expect(await memberRows()).toEqual([
      { folder_id: "fld_e2e_other", note_id: "not_e2e_other" },
      { folder_id: "fld_e2e_personal", note_id: "not_e2e_solo" },
      { folder_id: "fld_e2e_product", note_id: "not_e2e_archived" },
      { folder_id: "fld_e2e_product", note_id: "not_e2e_launch" },
      { folder_id: "fld_e2e_product", note_id: "not_e2e_standup" },
    ]);
    const stamps = await rows(
      "SELECT created_at, updated_at FROM folders WHERE owner_id = 'usr_e2e_person'"
    );
    const added = await rows("SELECT added_at FROM folder_notes");
    expect(stamps.length).toBe(2);
    // Fixed instants, never now: every one is before the day this phase was specified.
    for (const value of [
      ...stamps.flatMap((row) => Object.values(row)),
      ...added.map((row) => row.added_at),
    ]) {
      expect(Number(value)).toBeLessThan(Date.UTC(2026, 8, 25));
    }
  });

  it("changes nothing when called a second time", async () => {
    await fresh();
    await folders().seedFolders();
    const folderSnapshot = await rows("SELECT * FROM folders ORDER BY id");
    const memberSnapshot = await rows(
      "SELECT * FROM folder_notes ORDER BY folder_id, note_id"
    );

    await folders().seedFolders();

    expect(await rows("SELECT * FROM folders ORDER BY id")).toEqual(
      folderSnapshot
    );
    expect(
      await rows("SELECT * FROM folder_notes ORDER BY folder_id, note_id")
    ).toEqual(memberSnapshot);
  });

  it("clears every folder and membership on reset, a folder a flow created included", async () => {
    await fresh();
    await folders().seedFolders();
    await d1
      .prepare(
        "INSERT INTO folders (id, name, name_key, owner_id, created_at, updated_at) VALUES ('fld_made_by_a_flow', 'Research', 'research', 'usr_e2e_person', 0, 0)"
      )
      .run();

    await harness.reset();

    expect(await rows("SELECT id FROM folders")).toEqual([]);
    expect(await rows("SELECT folder_id FROM folder_notes")).toEqual([]);
  });
});

// ── Phase 10: the support outbox read (docs/spec/phase-10.md §6.1, §6.3 "Harness", §7) ─────────
// `GET /e2e/support?kind=` is what `scripts/e2e-support.js` asserts a sent report against. The rows
// are written straight into `email_outbox` at fixed instants, so "newest first" and "at most 10" are
// exact; the send-then-read round trip through the real app is `apps/api/src/e2e-harness.test.ts`'s.
// The harness method is not built yet, so it is read through a cast, and it is named here:
// `supportMessages(kind) → { items: { to, subject, body, payload, createdAt }[] }`.

type SupportItem = {
  readonly body: string;
  readonly createdAt: number;
  readonly payload: Readonly<Record<string, string>>;
  readonly subject: string;
  readonly to: string;
};
type SupportHarness = {
  supportMessages: (
    kind: unknown
  ) => Promise<{ readonly items: readonly SupportItem[] }>;
};

describe("the E2E harness, phase 10", () => {
  let d1: TestD1;
  let harness: E2eService;

  beforeAll(() => {
    d1 = makeTestD1();
    const container = buildContainer(envOver(d1));
    if (container.e2e === null) {
      throw new Error("an armed configuration built no harness");
    }
    harness = container.e2e;
  });

  const support = () => {
    const read = (harness as unknown as Partial<SupportHarness>)
      .supportMessages;
    if (read === undefined) {
      throw new Error("phase 10: the harness has no supportMessages (§6.3)");
    }
    return (kind: unknown) => read.call(harness, kind);
  };

  const AT = Date.UTC(2026, 8, 25, 12);

  const outbox = async (
    id: string,
    kind: string,
    createdAt: number,
    subject = `Subject ${id}`
  ) => {
    await d1
      .prepare(
        "INSERT INTO email_outbox (id, kind, recipient, subject, body, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        id,
        kind,
        "support@notes.example",
        subject,
        `Body ${id}`,
        JSON.stringify({ receiptId: `sup_${id}` }),
        createdAt
      )
      .run();
  };

  it("answers only the kind asked for, newest first, with its fields", async () => {
    await harness.reset();
    await harness.seed();
    await outbox("out_1", "bug-report", AT);
    await outbox(
      "out_2",
      "bug-report",
      AT + 1000,
      "Bug report from Kothanote 1.0.0 (1) | e2e-person@kothanote.test"
    );
    await outbox("out_3", "feedback", AT + 2000);
    await outbox("out_4", "otp", AT + 3000);

    const { items } = await support()("bug-report");

    expect(items.map((item) => item.subject)).toEqual([
      "Bug report from Kothanote 1.0.0 (1) | e2e-person@kothanote.test",
      "Subject out_1",
    ]);
    expect(items[0]).toEqual({
      body: "Body out_2",
      createdAt: AT + 1000,
      payload: { receiptId: "sup_out_2" },
      subject:
        "Bug report from Kothanote 1.0.0 (1) | e2e-person@kothanote.test",
      to: "support@notes.example",
    });
    expect((await support()("feedback")).items).toHaveLength(1);
    expect((await support()("desktop-reminder")).items).toEqual([]);
  });

  it("answers at most 10", async () => {
    await harness.reset();
    for (let i = 0; i < 12; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: fixed instants, one row at a time
      await outbox(`out_${i}`, "feedback", AT + i * 1000);
    }

    const { items } = await support()("feedback");

    expect(items).toHaveLength(10);
    expect(items[0]?.subject).toBe("Subject out_11");
  });

  it("refuses the otp kind, and any other it does not serve, as ValidationFailed", async () => {
    await expect(support()("otp")).rejects.toMatchObject({
      _tag: "ValidationFailed",
    });
    await expect(support()("anything")).rejects.toMatchObject({
      _tag: "ValidationFailed",
    });
  });

  it("answers an empty list after a reset", async () => {
    await outbox("out_reset", "bug-report", AT);

    await harness.reset();

    expect((await support()("bug-report")).items).toEqual([]);
  });
});

// ── Phase 11: the fake calendar's store (docs/spec/phase-11.md §6.1, §6.5, §7 case 19) ────────────
// `stageCalendar` (behind `POST /e2e/calendar`) replaces one role's rows in `fake_calendar_events`;
// `setCalendarMode` (behind `POST /e2e/calendar/mode`) writes the `calendar` switch the fake reads.
// Neither exists yet, so both are read through a cast. The demo preset is relative to the server's
// clock, so the container's clock is pinned with fake timers (Date only) rather than a new dep.

type CalendarHarness = {
  setCalendarMode: (mode: unknown) => Promise<{ mode: string }>;
  stageCalendar: (
    body: unknown
  ) => Promise<{ items: { id: string; title: string | null }[] }>;
};
type CalendarView = {
  upcoming: (
    who: E2eUser,
    query: { until: number }
  ) => Promise<{ items: { id: string; title: string | null }[] }>;
};

describe("the E2E harness, phase 11", () => {
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  // 12:20 UTC, so the demo's `h` (the next whole UTC hour) is 13:00.
  const T = Date.UTC(2026, 8, 25, 12, 20);
  const H = Date.UTC(2026, 8, 25, 13);

  let d1: TestD1;
  let container: ReturnType<typeof buildContainer>;
  let harness: E2eService;

  beforeAll(() => {
    d1 = makeTestD1();
    container = buildContainer(envOver(d1));
    if (container.e2e === null) {
      throw new Error("an armed configuration built no harness");
    }
    harness = container.e2e;
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T);
    await harness.reset();
    await harness.seed();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const calendar = () => harness as unknown as CalendarHarness;

  const rows = async (sql: string) => (await d1.prepare(sql).all()).results;

  const staged = () =>
    rows(
      "SELECT user_id, id, title, start_at, end_at, color, attendees, created_at FROM fake_calendar_events ORDER BY user_id, start_at, id"
    );

  const meeting = (title: string | null, startAt: number, endAt: number) => ({
    endAt,
    startAt,
    title,
  });

  // §7 case 19
  it("stages one role's events, defaulting ids to cev_e2e_<role>_<n> in array order", async () => {
    const answer = await calendar().stageCalendar({
      events: [
        {
          ...meeting("Design review", T - 15 * MINUTE, T + 45 * MINUTE),
          attendees: [{ email: "priya@example.com", name: "Priya Raman" }],
        },
        { ...meeting(null, T + HOUR, T + 2 * HOUR), color: "#00FF00" },
        { ...meeting("Named", T + 3 * HOUR, T + 4 * HOUR), id: "cev_given" },
      ],
      role: "person",
    });

    expect(answer).toEqual({
      items: [
        { id: "cev_e2e_person_1", title: "Design review" },
        { id: "cev_e2e_person_2", title: null },
        { id: "cev_given", title: "Named" },
      ],
    });
    const written = await staged();
    expect(written).toHaveLength(3);
    expect(written[0]).toMatchObject({
      created_at: T,
      end_at: T + 45 * MINUTE,
      id: "cev_e2e_person_1",
      start_at: T - 15 * MINUTE,
      title: "Design review",
      user_id: E2E_USERS.person.id,
    });
    expect(JSON.parse(String(written[0]?.attendees))).toEqual([
      { email: "priya@example.com", name: "Priya Raman" },
    ]);
    expect(written[1]).toMatchObject({ color: "#00FF00", title: null });
  });

  it("replaces only that role's rows", async () => {
    await calendar().stageCalendar({
      events: [meeting("Other’s meeting", T + HOUR, T + 2 * HOUR)],
      role: "other",
    });
    await calendar().stageCalendar({
      events: [
        meeting("First", T + HOUR, T + 2 * HOUR),
        meeting("Second", T + 3 * HOUR, T + 4 * HOUR),
      ],
      role: "person",
    });

    await calendar().stageCalendar({
      events: [meeting("Only", T + HOUR, T + 2 * HOUR)],
      role: "person",
    });

    expect(
      (await staged()).map(({ id, title, user_id }) => ({ id, title, user_id }))
    ).toEqual(
      [
        {
          id: "cev_e2e_other_1",
          title: "Other’s meeting",
          user_id: E2E_USERS.other.id,
        },
        { id: "cev_e2e_person_1", title: "Only", user_id: E2E_USERS.person.id },
      ].sort((a, b) => (a.user_id < b.user_id ? -1 : 1))
    );

    await calendar().stageCalendar({ events: [], role: "person" });

    expect((await staged()).map(({ user_id }) => user_id)).toEqual([
      E2E_USERS.other.id,
    ]);
  });

  it.each([
    [
      "an event that ends at its start",
      { events: [meeting("Zero", T, T)], role: "person" },
    ],
    [
      "an event that ends before its start",
      { events: [meeting("Backwards", T + HOUR, T)], role: "person" },
    ],
    [
      "more than 50 attendees",
      {
        events: [
          {
            ...meeting("Crowd", T, T + HOUR),
            attendees: Array.from({ length: 51 }, (_, n) => ({
              name: `Guest ${n}`,
            })),
          },
        ],
        role: "person",
      },
    ],
    [
      "more than 50 events",
      {
        events: Array.from({ length: 51 }, (_, n) =>
          meeting(`Meeting ${n}`, T + n * HOUR, T + n * HOUR + MINUTE)
        ),
        role: "person",
      },
    ],
    ["an unknown role", { events: [], role: "administrator" }],
    ["an unknown preset", { preset: "busy", role: "person" }],
    [
      "a key the event does not own",
      {
        events: [{ ...meeting("Extra", T, T + HOUR), location: "Room 1" }],
        role: "person",
      },
    ],
  ])(
    "refuses %s as ValidationFailed (422), writing nothing",
    async (_, body) => {
      await expect(calendar().stageCalendar(body)).rejects.toMatchObject({
        _tag: "ValidationFailed",
        status: 422,
      });
      expect(await staged()).toEqual([]);
    }
  );

  it("stages the demo preset at the next whole UTC hour of the server clock", async () => {
    const answer = await calendar().stageCalendar({
      preset: "demo",
      role: "person",
    });

    expect(answer.items.map((item) => item.title)).toEqual([
      "Design review",
      "Catch up with the team",
      "Weekly planning",
    ]);
    const written = await staged();
    expect(
      written.map((row) => ({
        attendees: JSON.parse(String(row.attendees)).map(
          (a: { name: string | null }) => a.name
        ),
        end_at: row.end_at,
        start_at: row.start_at,
        title: row.title,
      }))
    ).toEqual([
      {
        attendees: ["Priya Raman"],
        end_at: H + HOUR,
        start_at: H,
        title: "Design review",
      },
      {
        attendees: ["Priya Raman", "Sam Okafor"],
        end_at: H + 3 * HOUR,
        start_at: H + 2 * HOUR,
        title: "Catch up with the team",
      },
      {
        attendees: [],
        end_at: H + 24 * HOUR + 30 * MINUTE,
        start_at: H + 24 * HOUR,
        title: "Weekly planning",
      },
    ]);

    await calendar().stageCalendar({ preset: "demo", role: "person" });

    expect(await staged()).toEqual(written);
  });

  it("sets the calendar switch, refusing a mode it does not know", async () => {
    await expect(calendar().setCalendarMode("fail")).resolves.toEqual({
      mode: "fail",
    });
    expect(
      await rows("SELECT value FROM e2e_switches WHERE name = 'calendar'")
    ).toEqual([{ value: "fail" }]);

    await expect(calendar().setCalendarMode("sometimes")).rejects.toMatchObject(
      {
        _tag: "ValidationFailed",
        status: 422,
      }
    );
  });

  it("serves the staged rows through the container's calendar, and fails them while the switch reads fail", async () => {
    await calendar().stageCalendar({
      events: [meeting("Design review", T + HOUR, T + 2 * HOUR)],
      role: "person",
    });
    const upcoming = (container as unknown as { calendar: CalendarView })
      .calendar;

    await expect(
      upcoming.upcoming(E2E_USERS.person, { until: T + 24 * HOUR })
    ).resolves.toMatchObject({
      items: [{ id: "cev_e2e_person_1", title: "Design review" }],
    });

    await calendar().setCalendarMode("fail");

    await expect(
      upcoming.upcoming(E2E_USERS.person, { until: T + 24 * HOUR })
    ).rejects.toMatchObject({ _tag: "CalendarUnavailable", status: 503 });
  });

  it("empties the table and the switch on reset", async () => {
    await calendar().stageCalendar({ preset: "demo", role: "person" });
    await calendar().setCalendarMode("fail");

    await harness.reset();

    expect(await staged()).toEqual([]);
    expect(
      await rows("SELECT value FROM e2e_switches WHERE name = 'calendar'")
    ).toEqual([]);
  });
});
