import type { Utterance } from "@gc/domain/Domain/Recording";
import { LlmRateLimited, LlmUnavailable } from "@gc/domain/Llm/Errors";
import type { LlmMode, LlmPort, NoteAnswer, NoteRequest } from "./Port";

export type LlmFakeDeps = {
  // Asked on every call, so a switch flipped between two attempts is seen by the second.
  readonly readMode: () => Promise<LlmMode>;
};

const BRIEF_TITLE = "Brief check-in";
const TITLE_MAX = 60;
const GREETING_PARAGRAPH =
  "Not much to transcribe here. The recording captured only a brief greeting with no substantive discussion, decisions, or follow-ups.";
const SILENCE_PARAGRAPH =
  "Not much to transcribe here. The recording didn’t capture any speech.";

// Neutral on purpose, like the transcriber's corpus: nothing a reader could mistake for a summary
// of a real meeting.
const NEUTRAL_TITLES = [
  "Planning sync",
  "Weekly check-in",
  "Project review",
  "Team catch-up",
  "Status update",
  "Working session",
  "Follow-up discussion",
  "Quick sync",
] as const;

const DISCUSSION_BULLETS = 6;
const NESTED_SENTENCES = 2;
const OWN_NOTES_LINES = 10;

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

const SENTENCE = /[^.!?]+(?:[.!?]+|$)/g;

const MODULUS = 2_147_483_647;
const HASH_BASE = 31;

// A polynomial hash: plain arithmetic and the same answer everywhere. Stability is the point.
const hashOf = (text: string): number => {
  let hash = 1;
  for (const char of text) {
    hash = (hash * HASH_BASE + (char.codePointAt(0) ?? 0)) % MODULUS;
  }
  return hash;
};

const linesOf = (privateNotes: string): string[] =>
  privateNotes
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const typedTitleOf = (privateNotes: string): string | null => {
  const first = linesOf(privateNotes)[0];
  return first === undefined ? null : first.slice(0, TITLE_MAX).trim();
};

const sentencesOf = (text: string): string[] =>
  (text.match(SENTENCE) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

// Nesting is per utterance, as §6.6 says. The transcriber's corpus repeats lines, so a sentence
// already written anywhere in the section is skipped: a repeat reads as a broken note, not a fake.
const discussionOf = (utterances: readonly Utterance[]): string => {
  const written = new Set<string>();
  const fresh = (sentences: readonly string[]): string[] =>
    sentences.filter((sentence) => {
      if (written.has(sentence)) {
        return false;
      }
      written.add(sentence);
      return true;
    });
  return [
    "### Discussion",
    ...utterances.slice(0, DISCUSSION_BULLETS).flatMap((utterance) => {
      const [first, ...rest] = fresh(sentencesOf(utterance.text));
      return first === undefined
        ? []
        : [
            `- ${first}`,
            ...rest.slice(0, NESTED_SENTENCES).map((line) => `  - ${line}`),
          ];
    }),
  ].join("\n");
};

const briefAnswer = (request: NoteRequest): string => {
  const typed = typedTitleOf(request.privateNotes);
  const paragraph =
    request.utterances.length === 0 ? SILENCE_PARAGRAPH : GREETING_PARAGRAPH;
  return JSON.stringify({
    notes_markdown:
      typed === null ? paragraph : `${paragraph} Your typed notes: “${typed}”.`,
    title: typed ?? BRIEF_TITLE,
  });
};

// Fenced on purpose, as models often answer despite being told not to, so the parser's unwrap runs
// on every fake run rather than only in its own tests.
const fullAnswer = (request: NoteRequest): string => {
  const own = linesOf(request.privateNotes).slice(0, OWN_NOTES_LINES);
  const sections = [
    discussionOf(request.utterances),
    ...(own.length === 0
      ? []
      : [["### Your notes", ...own.map((line) => `- ${line}`)].join("\n")]),
    NEXT_STEPS,
  ];
  const neutral =
    NEUTRAL_TITLES[
      hashOf(request.utterances.map(({ text }) => text).join("\n")) %
        NEUTRAL_TITLES.length
    ] ?? NEUTRAL_TITLES[0];
  const json = JSON.stringify({
    notes_markdown: sections.join("\n\n"),
    title: typedTitleOf(request.privateNotes) ?? neutral,
  });
  return `\`\`\`json\n${json}\n\`\`\``;
};

const answerFor = (request: NoteRequest): string =>
  request.kind === "brief" ? briefAnswer(request) : fullAnswer(request);

// Deterministic (a pure function of the request, never Math.random), and records every call,
// including the ones it failed.
export const makeLlmFake = (deps: LlmFakeDeps) => {
  const calls: NoteRequest[] = [];

  const port: LlmPort = {
    generateNote: async (request): Promise<NoteAnswer> => {
      calls.push(request);
      const mode = await deps.readMode();
      switch (mode) {
        case "hold":
          throw new LlmRateLimited({ key: request.key }, "fake in hold mode");
        case "fail":
          throw new LlmUnavailable({ key: request.key }, "fake in fail mode");
        case "malformed":
          return { raw: "not json", truncated: false };
        case "truncated": {
          const raw = answerFor(request);
          return {
            raw: raw.slice(0, Math.floor(raw.length / 2)),
            truncated: true,
          };
        }
        default:
          return { raw: answerFor(request), truncated: false };
      }
    },
  };

  return {
    ...port,
    get calls(): readonly NoteRequest[] {
      return calls;
    },
  };
};

export type LlmFake = ReturnType<typeof makeLlmFake>;
