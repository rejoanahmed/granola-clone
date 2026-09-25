import * as LlmErrors from "@gc/domain/Llm/Errors";
import { describe, expect, it } from "vitest";
import * as Output from "../../Generations/Output";
import * as Fake from "./LlmFake";

// docs/spec/phase-6.md §6.6 and §7 "Integrations/Llm/Llm.test.ts". The fake stands in for a vendor
// in every test, local run and flow, so it must be a pure function of the request (never
// Math.random), record what it was asked, and do exactly what each scripted mode promises the
// harness. Its answers are read back through the real parser, because that is how they are used.

type Mode = "auto" | "fail" | "hold" | "malformed" | "truncated";
type Utterance = {
  readonly endMs: number;
  readonly speaker: string;
  readonly startMs: number;
  readonly text: string;
};
type NoteRequest = {
  readonly attendeeNames: readonly string[];
  readonly key: string;
  readonly kind: "brief" | "full";
  readonly privateNotes: string;
  readonly startedAt: number;
  readonly timeoutMs: number;
  readonly utterances: readonly Utterance[];
};
type Answer = { readonly raw: string; readonly truncated: boolean };
type LlmFake = {
  readonly calls: readonly NoteRequest[];
  generateNote: (request: NoteRequest) => Promise<Answer>;
};
type Parsed = { readonly bodyMarkdown: string; readonly title: string | null };

const AT = 1_700_000_000_000;
const TOP_LEVEL_BULLET = /^- /gm;
const KEY = "gen_0000000000000001:1";

const GREETING_PARAGRAPH =
  "Not much to transcribe here. The recording captured only a brief greeting with no substantive discussion, decisions, or follow-ups.";
const SILENCE_PARAGRAPH =
  "Not much to transcribe here. The recording didn’t capture any speech.";
const NEXT_STEPS = [
  "### Next Steps",
  "- **Confirm owners for the open items**",
  "",
  "  Agree who takes each open question raised in this conversation.",
  "",
  "- **Share these notes with the attendees**",
  "",
  "  Send the summary to everyone who was in the meeting.",
].join("\n");

const utterance = (
  speaker: string,
  text: string,
  index: number
): Utterance => ({
  endMs: (index + 1) * 15_000,
  speaker,
  startMs: index * 15_000,
  text,
});

const LONG_TALK: readonly Utterance[] = [
  "Let's start with where we landed last week.",
  "I think the first draft is close, but the numbers need another pass.",
  "Can we agree on the owner for that before we move on?",
  "The timeline still works if the review happens on Thursday.",
  "That makes sense to me.",
  "I'd like to see the options side by side first.",
  "We should write that down so nobody has to remember it.",
  "Thanks, that was useful.",
].map((text, index) => utterance(index % 2 === 0 ? "A" : "B", text, index));

const request = (overrides: Partial<NoteRequest> = {}): NoteRequest => ({
  attendeeNames: ["Person One"],
  key: KEY,
  kind: "full",
  privateNotes: "",
  startedAt: AT,
  timeoutMs: 120_000,
  utterances: LONG_TALK,
  ...overrides,
});

const brief = (overrides: Partial<NoteRequest> = {}): NoteRequest =>
  request({
    kind: "brief",
    utterances: [utterance("A", "Hello. How are you?", 0)],
    ...overrides,
  });

const fakeIn = (initial: Mode) => {
  let mode: Mode = initial;
  const fake: LlmFake = Fake.makeLlmFake({
    readMode: () => Promise.resolve(mode),
  });
  return {
    fake,
    set: (next: Mode) => {
      mode = next;
    },
  };
};

const generated = async (input: NoteRequest): Promise<Parsed> => {
  const { fake } = fakeIn("auto");
  const answer = await fake.generateNote(input);
  return Output.parseGeneratedNote(answer.raw, {
    truncated: answer.truncated,
  });
};

describe("LlmFake, deterministic", () => {
  it("answers the same raw text for the same request", async () => {
    const { fake } = fakeIn("auto");

    const first = await fake.generateNote(request());
    const second = await fake.generateNote(request());

    expect(second).toEqual(first);
    expect(first.truncated).toBe(false);
  });

  it("answers the same for a brief request too", async () => {
    const { fake } = fakeIn("auto");

    await expect(fake.generateNote(brief())).resolves.toEqual(
      await fake.generateNote(brief())
    );
  });

  it("records every call, the request exactly as it was made", async () => {
    const { fake } = fakeIn("auto");

    await fake.generateNote(request());
    await fake.generateNote(brief({ key: "gen_0000000000000002:1" }));

    expect(fake.calls).toEqual([
      request(),
      brief({ key: "gen_0000000000000002:1" }),
    ]);
  });

  it("records a call it failed", async () => {
    const { fake } = fakeIn("fail");

    await fake.generateNote(request()).catch(() => undefined);

    expect(fake.calls).toEqual([request()]);
  });
});

describe("LlmFake, auto, brief", () => {
  it("titles it Brief check-in and writes the #40 greeting paragraph", async () => {
    await expect(generated(brief())).resolves.toEqual({
      bodyMarkdown: GREETING_PARAGRAPH,
      title: "Brief check-in",
    });
  });

  it("writes the silence paragraph for a transcript with no utterances", async () => {
    await expect(generated(brief({ utterances: [] }))).resolves.toEqual({
      bodyMarkdown: SILENCE_PARAGRAPH,
      title: "Brief check-in",
    });
  });

  it("takes the title from the first non-blank line of the private notes, and quotes it", async () => {
    await expect(
      generated(brief({ privateNotes: "\n  Budget follow-up  \nsecond line" }))
    ).resolves.toEqual({
      bodyMarkdown: `${GREETING_PARAGRAPH} Your typed notes: “Budget follow-up”.`,
      title: "Budget follow-up",
    });
  });

  it("trims that title to 60 characters", async () => {
    const line = "x".repeat(75);

    const { title } = await generated(brief({ privateNotes: line }));

    expect(title).toBe("x".repeat(60));
  });

  it("never writes the tip itself: that is the server's copy", async () => {
    const { bodyMarkdown } = await generated(brief());

    expect(bodyMarkdown).not.toContain("Notes works best");
  });
});

describe("LlmFake, auto, full", () => {
  it("wraps its answer in a ```json fence, so the parser's unwrap runs on every fake run", async () => {
    const { fake } = fakeIn("auto");

    const { raw } = await fake.generateNote(request());

    expect(raw.startsWith("```json")).toBe(true);
    expect(raw.trimEnd().endsWith("```")).toBe(true);
  });

  it("writes Discussion, then Next Steps with the two bold next-step pairs", async () => {
    const { bodyMarkdown } = await generated(request());

    expect(bodyMarkdown.startsWith("### Discussion\n- ")).toBe(true);
    expect(bodyMarkdown.endsWith(NEXT_STEPS)).toBe(true);
    expect(bodyMarkdown).not.toContain("### Your notes");
  });

  it("makes a bullet of each of the first six utterances, and no more", async () => {
    const { bodyMarkdown } = await generated(request());
    const discussion = bodyMarkdown.split("### Next Steps")[0] ?? "";

    expect(discussion).toContain(`- ${LONG_TALK[0]?.text}`);
    expect(discussion).toContain(`- ${LONG_TALK[5]?.text}`);
    expect(discussion).not.toContain(LONG_TALK[6]?.text);
    expect(discussion.match(TOP_LEVEL_BULLET)).toHaveLength(6);
  });

  it("nests up to two further sentences of an utterance under its first", async () => {
    const merged = utterance(
      "A",
      "Alpha is first. Beta is second. Gamma is third. Delta is fourth.",
      0
    );

    const { bodyMarkdown } = await generated(
      request({ utterances: [merged, ...LONG_TALK.slice(1)] })
    );

    expect(bodyMarkdown).toContain(
      "- Alpha is first.\n  - Beta is second.\n  - Gamma is third."
    );
    expect(bodyMarkdown).not.toContain("Delta is fourth.");
  });

  // The transcriber's corpus repeats lines, which once put "That makes sense to me." in the
  // section twice: a bullet of its own and nested under another utterance.
  it("writes a sentence once, however many utterances repeat it", async () => {
    const { bodyMarkdown } = await generated(
      request({
        utterances: [
          utterance("A", "Opening point. That makes sense to me.", 0),
          utterance("B", "That makes sense to me. Next thing.", 1),
          ...LONG_TALK.slice(2),
        ],
      })
    );
    const discussion = bodyMarkdown.split("### Next Steps")[0] ?? "";

    expect(discussion.split("That makes sense to me.")).toHaveLength(2);
    expect(discussion).toContain(
      "- Opening point.\n  - That makes sense to me.\n- Next thing."
    );
  });

  it("adds Your notes from the private notes, each non-blank line trimmed, at most ten", async () => {
    const lines = Array.from({ length: 12 }, (_, i) => `  Point ${i + 1}  `);

    const { bodyMarkdown, title } = await generated(
      request({ privateNotes: `Budget follow-up\n\n${lines.join("\n")}` })
    );

    expect(title).toBe("Budget follow-up");
    expect(bodyMarkdown).toContain(
      "### Your notes\n- Budget follow-up\n- Point 1\n"
    );
    expect(bodyMarkdown).toContain("- Point 9\n");
    expect(bodyMarkdown).not.toContain("Point 10");
  });

  it("picks a neutral title from the transcript without private notes, the same one every time", async () => {
    const first = await generated(request());
    const again = await generated(request());

    expect(first.title).toEqual(expect.any(String));
    expect(first.title).not.toBe("Untitled note");
    expect(first.title).not.toBe("Brief check-in");
    expect(again.title).toBe(first.title);
  });
});

describe("LlmFake, scripted modes", () => {
  it("hold throws LlmRateLimited, so the job waits unspent", async () => {
    const { fake } = fakeIn("hold");

    await expect(fake.generateNote(request())).rejects.toBeInstanceOf(
      LlmErrors.LlmRateLimited
    );
  });

  it("fail throws LlmUnavailable", async () => {
    const { fake } = fakeIn("fail");

    await expect(fake.generateNote(request())).rejects.toBeInstanceOf(
      LlmErrors.LlmUnavailable
    );
  });

  it("malformed answers text that is not JSON", async () => {
    const { fake } = fakeIn("malformed");

    await expect(fake.generateNote(request())).resolves.toEqual({
      raw: "not json",
      truncated: false,
    });
  });

  it("truncated answers with the truncated flag set", async () => {
    const { fake } = fakeIn("truncated");

    await expect(fake.generateNote(request())).resolves.toMatchObject({
      truncated: true,
    });
  });

  it("reads the mode on every call, so a switch flipped between two attempts is seen", async () => {
    const { fake, set } = fakeIn("fail");

    await expect(fake.generateNote(request())).rejects.toBeInstanceOf(
      LlmErrors.LlmUnavailable
    );
    set("auto");

    await expect(fake.generateNote(request())).resolves.toMatchObject({
      truncated: false,
    });
  });

  it("carries each error's status (R7)", () => {
    expect(new LlmErrors.LlmUnavailable({}).status).toBe(503);
    expect(new LlmErrors.LlmRateLimited({}).status).toBe(429);
    expect(new LlmErrors.LlmRejected({}).status).toBe(422);
    expect(new LlmErrors.LlmTimeout({}).status).toBe(504);
  });
});

// ── Phase 7: the chat half (docs/spec/phase-7.md §6.5, §6.6, §7 "Llm.test.ts, extended") ──────
// `streamAnswer` and `titleChat` do not exist yet, so the fake is read through the shape §6.5
// gives it. It is built from a variable so the phase-6 deps type does not refuse the chat deps.

type ChatMode = "auto" | "fail" | "hold";
type ChatContextNote = {
  readonly bodyMarkdown: string;
  readonly index: number;
  readonly startedAt: number;
  readonly title: string;
  readonly transcriptText: string;
};
type ChatAnswerRequest = {
  readonly history: readonly { content: string; role: string }[];
  readonly key: string;
  readonly model: string;
  readonly notes: readonly ChatContextNote[];
  readonly question: string;
  readonly scope: "global" | "note" | "person";
  readonly timeoutMs: number;
};
type ChatFake = {
  readonly chatCalls: readonly ChatAnswerRequest[];
  streamAnswer: (request: ChatAnswerRequest) => AsyncIterable<string>;
  titleChat: (request: { question: string }) => Promise<string>;
};

const NO_NOTES_LINE = "I couldn’t find anything in your notes about that.";
const ONE_WORD_DELTA = /^\S+\s*$/;

const chatFakeWith = (options: {
  readonly modes?: readonly ChatMode[];
  readonly tokenDelayMs?: number;
}) => {
  const modes = [...(options.modes ?? ["auto"])];
  const slept: number[] = [];
  const deps = {
    // Each read takes the next scripted mode and then keeps answering the last one.
    readChatMode: () =>
      Promise.resolve(
        (modes.length > 1 ? modes.shift() : modes[0]) ?? ("auto" as ChatMode)
      ),
    readMode: () => Promise.resolve("auto" as const),
    sleep: (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    },
    tokenDelayMs: options.tokenDelayMs ?? 0,
  };
  const fake = Fake.makeLlmFake(deps) as unknown as ChatFake;
  return { fake, slept };
};

const LAUNCH_NOTE: ChatContextNote = {
  bodyMarkdown:
    "### Launch checklist\n\n- Confirmed the beta cohort: forty teams across three regions\n- Pricing page copy still needs legal review",
  index: 1,
  startedAt: AT,
  title: "Launch planning review",
  transcriptText: "",
};
const STANDUP_NOTE: ChatContextNote = {
  bodyMarkdown: "### Updates\n\n- Pagination merged\n- Editor polish in review",
  index: 2,
  startedAt: AT - 1000,
  title: "Weekly standup",
  transcriptText: "",
};

const chatRequest = (
  overrides: Partial<ChatAnswerRequest> = {}
): ChatAnswerRequest => ({
  history: [],
  key: "msg_0000000000000002:1",
  model: "auto",
  notes: [LAUNCH_NOTE, STANDUP_NOTE],
  question: "What did we decide about pricing?",
  scope: "global",
  timeoutMs: 60_000,
  ...overrides,
});

const deltasOf = async (
  fake: ChatFake,
  input: ChatAnswerRequest
): Promise<string[]> => {
  const deltas: string[] = [];
  for await (const delta of fake.streamAnswer(input)) {
    deltas.push(delta);
  }
  return deltas;
};

describe("LlmFake, chat answers", () => {
  it("answers the same text for the same request, one word per delta", async () => {
    const { fake } = chatFakeWith({});

    const first = await deltasOf(fake, chatRequest());
    const second = await deltasOf(fake, chatRequest());

    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(5);
    for (const delta of first) {
      expect(delta).toMatch(ONE_WORD_DELTA);
    }
  });

  it("writes the global shape: the lead line, then one bullet per note with its index", async () => {
    const { fake } = chatFakeWith({});

    const text = (await deltasOf(fake, chatRequest())).join("");

    expect(text.startsWith("Here’s what I found in your notes:\n\n")).toBe(
      true
    );
    expect(text).toContain(
      "- **Launch planning review** — Pricing page copy still needs legal review [1]"
    );
    expect(text).toContain("- **Weekly standup** — ");
    expect(text).toContain("[2]");
  });

  it("writes the person scope in the global shape", async () => {
    const { fake } = chatFakeWith({});

    const text = (
      await deltasOf(
        fake,
        chatRequest({ notes: [LAUNCH_NOTE], scope: "person" })
      )
    ).join("");

    expect(text.startsWith("Here’s what I found in your notes:")).toBe(true);
    expect(text).toContain("- **Launch planning review** — ");
  });

  it("writes the note shape: From **<title>**:, then its bullets citing [1]", async () => {
    const { fake } = chatFakeWith({});

    const text = (
      await deltasOf(fake, chatRequest({ notes: [LAUNCH_NOTE], scope: "note" }))
    ).join("");

    expect(text.startsWith("From **Launch planning review**:\n\n")).toBe(true);
    expect(text).toContain("- Pricing page copy still needs legal review [1]");
    expect(text).not.toContain("[2]");
  });

  it("answers the couldn’t-find line when it was handed no notes", async () => {
    const { fake } = chatFakeWith({});

    const text = (await deltasOf(fake, chatRequest({ notes: [] }))).join("");

    expect(text.trim()).toBe(NO_NOTES_LINE);
  });

  it("waits tokenDelayMs between deltas, through the injected sleep", async () => {
    const { fake, slept } = chatFakeWith({ tokenDelayMs: 25 });

    const deltas = await deltasOf(fake, chatRequest());

    expect(slept.length).toBeGreaterThanOrEqual(deltas.length - 1);
    expect(slept.every((ms) => ms === 25)).toBe(true);
  });

  it("records every chat call, including one it failed", async () => {
    const { fake } = chatFakeWith({ modes: ["fail", "auto"] });

    await expect(deltasOf(fake, chatRequest())).rejects.toBeInstanceOf(
      LlmErrors.LlmUnavailable
    );
    await deltasOf(fake, chatRequest({ key: "msg_0000000000000002:2" }));

    expect(fake.chatCalls.map((call) => call.key)).toEqual([
      "msg_0000000000000002:1",
      "msg_0000000000000002:2",
    ]);
    expect(fake.chatCalls[0]?.notes).toEqual([LAUNCH_NOTE, STANDUP_NOTE]);
  });
});

describe("LlmFake, chat modes", () => {
  it("fail throws LlmUnavailable before the first delta", async () => {
    const { fake } = chatFakeWith({ modes: ["fail"] });
    const received: string[] = [];

    await expect(
      (async () => {
        for await (const delta of fake.streamAnswer(chatRequest())) {
          received.push(delta);
        }
      })()
    ).rejects.toBeInstanceOf(LlmErrors.LlmUnavailable);
    expect(received).toEqual([]);
  });

  it("hold polls every 250 ms until the switch moves, then answers as that mode", async () => {
    const { fake, slept } = chatFakeWith({
      modes: ["hold", "hold", "hold", "auto"],
    });

    const held = (await deltasOf(fake, chatRequest())).join("");
    const { fake: plain } = chatFakeWith({});
    const unheld = (await deltasOf(plain, chatRequest())).join("");

    expect(held).toBe(unheld);
    expect(slept.filter((ms) => ms === 250).length).toBeGreaterThanOrEqual(2);
  });

  it("hold released into fail throws LlmUnavailable", async () => {
    const { fake } = chatFakeWith({ modes: ["hold", "fail"] });

    await expect(deltasOf(fake, chatRequest())).rejects.toBeInstanceOf(
      LlmErrors.LlmUnavailable
    );
  });

  it("hold that never moves times out with LlmTimeout after CHAT_LLM_TIMEOUT_MS", async () => {
    const { fake, slept } = chatFakeWith({ modes: ["hold"] });

    await expect(deltasOf(fake, chatRequest())).rejects.toBeInstanceOf(
      LlmErrors.LlmTimeout
    );
    const waited = slept.reduce((sum, ms) => sum + ms, 0);
    expect(waited).toBeGreaterThanOrEqual(60_000);
    expect(waited).toBeLessThanOrEqual(60_000 + 250);
  });
});
