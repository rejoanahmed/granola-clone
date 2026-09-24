import { beforeAll, describe, expect, it } from "vitest";
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
    NATIVE_SCHEME: "gcnotes",
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
      nativeScheme: "gcnotes",
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
      "https://api-dev.gcnotes.example.com"
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
      email: "e2e-empty@gcnotes.test",
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
