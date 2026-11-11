import type { ChatAnswerRequest, NoteRequest } from "./Port";

// The live clients' prompts, apart from any transport, so Workers AI and an OpenAI-compatible
// endpoint ask exactly the same question and a test can read the prompt without a network.

export type ChatMessage = {
  readonly content: string;
  readonly role: "assistant" | "system" | "user";
};

// A long Bengali meeting tokenises at several tokens per word, so the transcript is capped rather
// than trusted to fit: past this, the middle is cut and says so. Roughly 30k tokens of English.
export const TRANSCRIPT_CHARS_MAX = 120_000;

const clock = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export const transcriptTextOf = (
  utterances: NoteRequest["utterances"]
): string => {
  const full = utterances
    .map((u) => `[${clock(u.startMs)}] Speaker ${u.speaker}: ${u.text}`)
    .join("\n");
  if (full.length <= TRANSCRIPT_CHARS_MAX) {
    return full;
  }
  const half = Math.floor(TRANSCRIPT_CHARS_MAX / 2);
  return `${full.slice(0, half)}\n[… the middle of the meeting is omitted for length …]\n${full.slice(-half)}`;
};

// The output contract is docs/spec/phase-6.md §6.5: one JSON object, `title` and `notes_markdown`,
// in the phase-4 markdown subset. The parser normalises what a model gets slightly wrong; this
// asks for it right so it seldom has to.
const NOTE_SYSTEM = `You write meeting notes for the person who recorded the meeting.

Answer with ONE JSON object and nothing else:
{"title": string, "notes_markdown": string}

Language: write the title and the notes in the language the meeting was mostly held in. Meetings are often in Bengali (Bangla), English, or a mix of both. For a mixed Bengali/English meeting, write in Bengali script and keep English words, product names and technical terms in English as they were spoken. Never translate names.

title: at most 8 words, specific to what was discussed, no trailing period, no quotes.

notes_markdown rules:
- Only "### " headings, "- " bullets, and at most one level of nesting (two spaces before "- ").
- Start with the topics actually discussed, one "### " heading per topic, with concise bullets of what was said, decided or asked.
- Use **bold** only for decisions and for each next step's title.
- End with "### Next Steps" listing concrete follow-ups as "- **<who does what>**" bullets, when there are any.
- Use the attendees' names when the transcript makes clear who spoke; otherwise "Speaker A" etc. are fine to omit.
- Do not invent facts that are not in the transcript or the typed notes. Do not add a summary of the summary.`;

const BRIEF_SYSTEM = `You write meeting notes for the person who recorded the meeting. This recording has almost no speech.

Answer with ONE JSON object and nothing else:
{"title": string, "notes_markdown": string}

title: at most 6 words, no trailing period.
notes_markdown: ONE short paragraph (no headings, no bullets) saying what little was captured, in the language that was spoken (Bengali, English or a mix), or English if nothing was.`;

export const noteMessages = (request: NoteRequest): readonly ChatMessage[] => {
  const lines = [
    `Meeting started: ${new Date(request.startedAt).toISOString()}`,
    request.attendeeNames.length > 0
      ? `Attendees: ${request.attendeeNames.join(", ")}`
      : "Attendees: not listed",
    "",
    "Notes the user typed during the meeting (take them into account; they may be empty):",
    request.privateNotes.trim() === "" ? "(none)" : request.privateNotes.trim(),
    "",
    "Transcript:",
    request.utterances.length === 0
      ? "(no speech was captured)"
      : transcriptTextOf(request.utterances),
  ];
  return [
    {
      content: request.kind === "brief" ? BRIEF_SYSTEM : NOTE_SYSTEM,
      role: "system",
    },
    { content: lines.join("\n"), role: "user" },
  ];
};

// A note's context for chat is capped harder than a transcript for notes: the answer may cite up
// to several notes, and each must fit beside the others.
const CONTEXT_NOTE_CHARS_MAX = 12_000;

const cap = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)} …`;

const CHAT_SYSTEM = `You answer questions about the user's own meeting notes. You are given numbered notes. Use only them.

Rules:
- Answer in the language of the question (Bengali, English, or a mix, as the user wrote it).
- Cite every claim with the note's number in square brackets, like [1] or [2], right after the sentence it supports. Use only the numbers you were given.
- If the notes do not contain the answer, say so plainly in one sentence. Do not guess.
- Be concise: short paragraphs or "- " bullets. No headings.`;

export const chatMessages = (
  request: ChatAnswerRequest
): readonly ChatMessage[] => {
  const context =
    request.notes.length === 0
      ? "(no notes matched this question)"
      : request.notes
          .map((note) =>
            [
              `[${note.index}] ${note.title} — ${new Date(note.startedAt).toISOString().slice(0, 10)}`,
              cap(note.bodyMarkdown, CONTEXT_NOTE_CHARS_MAX),
              note.transcriptText === ""
                ? ""
                : `Transcript excerpt:\n${cap(note.transcriptText, CONTEXT_NOTE_CHARS_MAX)}`,
            ]
              .filter((part) => part !== "")
              .join("\n")
          )
          .join("\n\n");
  return [
    { content: `${CHAT_SYSTEM}\n\nNotes:\n${context}`, role: "system" },
    ...request.history.map((turn) => ({
      content: turn.content,
      role: turn.role,
    })),
    { content: request.question, role: "user" },
  ];
};

export const titleMessages = (question: string): readonly ChatMessage[] => [
  {
    content:
      "Write a title of at most 6 words for a chat that starts with the user's question. Same language as the question. Answer with the title only: no quotes, no trailing period.",
    role: "system",
  },
  { content: question, role: "user" },
];
