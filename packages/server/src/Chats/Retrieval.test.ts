import { describe, expect, it } from "vitest";
import * as Fake from "../Integrations/Llm/LlmFake";
import * as Retrieval from "./Retrieval";

// docs/spec/phase-7.md §7 case 22: the pure halves of asking. Retrieval is keyword scoring in the
// service over rows SQL already filtered to the caller, and the fake's answer is a pure function of
// what it was handed. `personKeyOf` lives in `@kn/domain/Domain/Person` and is pinned there.

type ScoredNote = {
  readonly bodyMarkdown: string;
  readonly noteId: string;
  readonly startedAt: number;
  readonly title: string;
  readonly transcriptText: string;
};
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
  streamAnswer: (request: ChatAnswerRequest) => AsyncIterable<string>;
  titleChat: (request: { question: string }) => Promise<string>;
};

const AT = 1_700_000_000_000;

const note = (overrides: Partial<ScoredNote> = {}): ScoredNote => ({
  bodyMarkdown: "",
  noteId: "not_0000000000000001",
  startedAt: AT,
  title: "Untitled",
  transcriptText: "",
  ...overrides,
});

// The chat half of the fake, in `auto`, instant. Built from a variable so the phase-6 deps type
// does not refuse the chat deps as excess properties.
const chatFake = (): ChatFake => {
  const deps = {
    readChatMode: () => Promise.resolve("auto" as const),
    readMode: () => Promise.resolve("auto" as const),
    sleep: () => Promise.resolve(),
    tokenDelayMs: 0,
  };
  return Fake.makeLlmFake(deps) as unknown as ChatFake;
};

const answerOf = async (request: ChatAnswerRequest): Promise<string> => {
  let text = "";
  for await (const delta of chatFake().streamAnswer(request)) {
    text += delta;
  }
  return text;
};

const ask = (
  question: string,
  notes: readonly ChatContextNote[],
  scope: ChatAnswerRequest["scope"] = "note"
): ChatAnswerRequest => ({
  history: [],
  key: "msg_0000000000000002:1",
  model: "auto",
  notes,
  question,
  scope,
  timeoutMs: 60_000,
});

describe("searchTerms", () => {
  it("keeps the lowercased words of three letters or more", () => {
    const terms: string[] = Retrieval.searchTerms(
      "What did we decide about PRICING?"
    );

    expect(terms).toContain("pricing");
    expect(terms).toContain("decide");
    expect(terms).not.toContain("we");
    for (const term of terms) {
      expect(term).toBe(term.toLowerCase());
      expect(term.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("drops the stopwords", () => {
    const terms: string[] = Retrieval.searchTerms(
      "What are the plans for the budget and the launch?"
    );

    expect(terms).toContain("budget");
    expect(terms).toContain("launch");
    expect(terms).not.toContain("the");
    expect(terms).not.toContain("and");
    expect(terms).not.toContain("for");
  });

  it("keeps at most twelve terms", () => {
    const question = Array.from(
      { length: 20 },
      (_, index) => `term${String.fromCodePoint(97 + index)}zz`
    ).join(" ");

    expect(Retrieval.searchTerms(question)).toHaveLength(12);
  });

  it("gives nothing for a question of stopwords and short words", () => {
    expect(Retrieval.searchTerms("is it on?")).toEqual([]);
  });
});

describe("scoreNote", () => {
  it("gives two points per distinct term in the title", () => {
    expect(
      Retrieval.scoreNote(note({ title: "Budget review" }), ["budget"])
    ).toBe(2);
  });

  it("gives one point per distinct term in the body or the transcript, not one per occurrence", () => {
    expect(
      Retrieval.scoreNote(
        note({
          bodyMarkdown: "The budget, the budget, the budget.",
          transcriptText: "We talked about the budget.",
        }),
        ["budget"]
      )
    ).toBe(1);
    expect(
      Retrieval.scoreNote(note({ transcriptText: "hiring plan" }), [
        "hiring",
        "plan",
      ])
    ).toBe(2);
  });

  it("adds the title and the body together", () => {
    expect(
      Retrieval.scoreNote(
        note({
          bodyMarkdown: "- The pricing page and the budget",
          title: "Pricing review",
        }),
        ["pricing", "budget"]
      )
    ).toBe(4);
  });

  it("scores zero when no term appears", () => {
    expect(
      Retrieval.scoreNote(note({ bodyMarkdown: "Nothing relevant" }), [
        "zebracorn",
      ])
    ).toBe(0);
  });

  // §6.6 and §7 case 3 rely on "Who have I promised to follow up with?" scoring nothing over the
  // seeded notes, and the solo note's body ends "or follow-ups.": a hyphenated compound is one word.
  it("does not match a term inside a hyphenated word", () => {
    expect(
      Retrieval.scoreNote(
        note({ bodyMarkdown: "No decisions, or follow-ups." }),
        ["follow"]
      )
    ).toBe(0);
  });
});

describe("titleChat, in the fake", () => {
  it("drops the trailing punctuation and keeps the rest verbatim", async () => {
    await expect(
      chatFake().titleChat({
        question: "Who have I promised to follow up with?",
      })
    ).resolves.toBe("Who have I promised to follow up with");
  });

  it("trims, drops every trailing ?, . and !, and uppercases the first letter", async () => {
    await expect(
      chatFake().titleChat({ question: "  what's next?!.  " })
    ).resolves.toBe("What's next");
  });

  it("cuts a long question at the last word boundary within 60 characters", async () => {
    const question =
      "Summarize everything we agreed about the enterprise onboarding checklist last quarter";

    const title = await chatFake().titleChat({ question });

    expect(title.length).toBeLessThanOrEqual(60);
    expect(question.startsWith(title)).toBe(true);
    expect(question.charAt(title.length)).toBe(" ");
  });
});

describe("the fake's best line", () => {
  const launch: ChatContextNote = {
    bodyMarkdown: [
      "### Launch checklist",
      "",
      "- Confirmed the beta cohort",
      "- Pricing page copy still needs legal review",
      "",
      "### Next Steps",
      "",
      "- **Finish the pricing page review**",
    ].join("\n"),
    index: 1,
    startedAt: AT,
    title: "Launch planning review",
    transcriptText: "",
  };

  it("picks the lines with the most terms, stripped of markdown, ties in document order", async () => {
    const answer = await answerOf(ask("What about pricing?", [launch]));

    expect(answer).toContain(
      "- Pricing page copy still needs legal review [1]"
    );
    expect(answer).not.toContain("**Finish");
    expect(answer).not.toContain("#");
  });

  it("takes the first non-heading lines when nothing scores", async () => {
    const answer = await answerOf(ask("zebracorn", [launch]));

    expect(answer).toContain("- Confirmed the beta cohort [1]");
    expect(answer).not.toContain("Launch checklist [1]");
  });

  it("writes at most three bullets for the note scope", async () => {
    const answer = await answerOf(ask("zebracorn", [launch]));

    expect(answer.startsWith("From **Launch planning review**:\n\n")).toBe(
      true
    );
    expect(answer.match(/^- /gm)?.length ?? 0).toBeLessThanOrEqual(3);
  });

  it("reads the transcript when the body has nothing", async () => {
    const answer = await answerOf(
      ask("zebracorn", [
        {
          ...launch,
          bodyMarkdown: "",
          transcriptText: "The zebracorn budget was approved.",
        },
      ])
    );

    expect(answer).toContain("- The zebracorn budget was approved. [1]");
  });

  it("cuts a line to 140 characters at a word boundary", async () => {
    const long = `${"alpha ".repeat(40)}omega`;
    const answer = await answerOf(
      ask("alpha", [{ ...launch, bodyMarkdown: `- ${long}` }])
    );
    const bullet = answer.split("\n").find((line) => line.startsWith("- "));
    const text = (bullet ?? "").slice(2).replace(" [1]", "");

    expect(text.length).toBeLessThanOrEqual(140);
    expect(long.startsWith(text)).toBe(true);
    expect(text.endsWith(" ")).toBe(false);
  });
});
