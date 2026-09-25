import { describe, expect, it } from "vitest";
import * as Chat from "./Chat";

// docs/spec/phase-7.md §6.2 and §4. The chips, the placeholders and the limits are one constant
// each, read by the fake, the server, the tests and the app, so a copy edit cannot reach one of
// them and not the others. The input schemas are the contract's 422s, so their edges are pinned here.

const AT = 1_700_000_000_000;

const MESSAGE = {
  activity: [],
  citations: [],
  content: "Hello",
  createdAt: AT,
  feedback: null,
  id: "msg_0000000000000001",
  model: null,
  role: "user",
  status: "complete",
};

describe("the chat constants (§4, §6.2)", () => {
  it("carries the four global chips and the three scoped ones, verbatim and in order", () => {
    expect(Chat.GLOBAL_CHIPS).toEqual([
      "Who have I promised to follow up with?",
      "What needs my attention first?",
      "Catch me up on what's important",
      "What are the top customer issues?",
    ]);
    expect(Chat.SCOPED_CHIPS).toEqual([
      "List action items",
      "Write follow-up email",
      "List Q&A",
    ]);
  });

  it("rotates the global placeholder through three lines, and holds the scoped one", () => {
    expect(Chat.GLOBAL_PLACEHOLDERS).toEqual([
      "Ask anything",
      "Who did I meet with?",
      "Summarize my meetings this week",
    ]);
    expect(Chat.SCOPED_PLACEHOLDER).toBe("Ask anything");
  });

  it("names the limits the service and the composer share", () => {
    expect(Chat.CHAT_MESSAGE_MAX).toBe(4000);
    expect(Chat.CHAT_TITLE_MAX).toBe(60);
    expect(Chat.CHAT_STREAM_STALE_AFTER_MS).toBe(2 * 60_000);
    expect(Chat.DEFAULT_CHAT_MODEL).toBe("auto");
  });
});

describe("the ids", () => {
  it("brands threads with cht_ and messages with msg_", () => {
    expect(Chat.ChatThreadId.safeParse("cht_0000000000000001").success).toBe(
      true
    );
    expect(Chat.ChatThreadId.safeParse("msg_0000000000000001").success).toBe(
      false
    );
    expect(Chat.ChatMessageId.safeParse("msg_0000000000000001").success).toBe(
      true
    );
    expect(Chat.ChatMessageId.safeParse("cht_0000000000000001").success).toBe(
      false
    );
  });
});

describe("ChatMessageContent", () => {
  it("trims before it measures, so whitespace alone is empty", () => {
    expect(Chat.ChatMessageContent.parse("  What next?  ")).toBe("What next?");
    expect(Chat.ChatMessageContent.safeParse("").success).toBe(false);
    expect(Chat.ChatMessageContent.safeParse("   \n\t ").success).toBe(false);
  });

  it("allows 4 000 characters and refuses 4 001", () => {
    expect(Chat.ChatMessageContent.safeParse("a".repeat(4000)).success).toBe(
      true
    );
    expect(Chat.ChatMessageContent.safeParse("a".repeat(4001)).success).toBe(
      false
    );
  });
});

describe("ChatScopeInput", () => {
  it("accepts the three kinds, each with exactly its own key", () => {
    expect(Chat.ChatScopeInput.safeParse({ kind: "global" }).success).toBe(
      true
    );
    expect(
      Chat.ChatScopeInput.safeParse({
        kind: "note",
        noteId: "not_e2e_launch",
      }).success
    ).toBe(true);
    expect(
      Chat.ChatScopeInput.safeParse({
        kind: "person",
        personKey: "email:priya@example.com",
      }).success
    ).toBe(true);
  });

  it("is strict: a scope with an extra key, or the wrong kind's key, is refused", () => {
    expect(
      Chat.ChatScopeInput.safeParse({ kind: "global", noteId: "not_e2e_solo" })
        .success
    ).toBe(false);
    expect(
      Chat.ChatScopeInput.safeParse({
        kind: "note",
        noteId: "not_e2e_launch",
        personKey: "email:priya@example.com",
      }).success
    ).toBe(false);
    expect(Chat.ChatScopeInput.safeParse({ kind: "team" }).success).toBe(false);
    expect(Chat.ChatScopeInput.safeParse({ kind: "note" }).success).toBe(false);
  });
});

describe("the models", () => {
  it("has nine ids, with auto last", () => {
    expect(Chat.ChatModelId.options).toEqual([
      "swift-thinking",
      "swift",
      "balanced-thinking",
      "balanced",
      "compact",
      "classic",
      "wide-context",
      "premium",
      "auto",
    ]);
  });
});

describe("ChatMessage", () => {
  it("parses a user message and an answered one with its citation and activity", () => {
    expect(Chat.ChatMessage.safeParse(MESSAGE).success).toBe(true);
    expect(
      Chat.ChatMessage.safeParse({
        ...MESSAGE,
        activity: [
          {
            kind: "search",
            notes: [{ noteId: "not_e2e_launch", title: "Launch" }],
          },
          {
            kind: "open",
            notes: [{ noteId: "not_e2e_launch", title: "Launch" }],
          },
          { kind: "done" },
        ],
        citations: [
          {
            index: 1,
            noteId: "not_e2e_launch",
            startedAt: AT,
            title: "Launch",
          },
        ],
        content: "Forty teams [1].",
        feedback: "up",
        id: "msg_0000000000000002",
        model: "auto",
        role: "assistant",
      }).success
    ).toBe(true);
  });

  it("refuses a citation numbered 0, an unknown status and an unknown feedback", () => {
    expect(
      Chat.ChatMessage.safeParse({
        ...MESSAGE,
        citations: [
          { index: 0, noteId: "not_e2e_launch", startedAt: AT, title: "L" },
        ],
      }).success
    ).toBe(false);
    expect(
      Chat.ChatMessage.safeParse({ ...MESSAGE, status: "queued" }).success
    ).toBe(false);
    expect(
      Chat.ChatMessage.safeParse({ ...MESSAGE, feedback: "meh" }).success
    ).toBe(false);
  });
});
