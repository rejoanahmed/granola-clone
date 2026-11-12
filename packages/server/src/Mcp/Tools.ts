import { BRAND } from "@kn/domain/Brand";
import { MAX_PAGE_LIMIT, PageQuery } from "@kn/domain/Domain/Page";
import type { Transcript } from "@kn/domain/Domain/Recording";
import { SEARCH_QUERY_MAX } from "@kn/domain/Domain/Search";
import { isAppError } from "@kn/domain/Errors";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";
import { logEvent } from "../Runtime/Logger";

// Every tool reads. A tool that writes is a different decision (D038): the token in an agent's
// config would then be able to change the owner's notes.
export type McpReads = Pick<Container, "notes" | "recordings" | "search">;

type ToolAnswer = {
  content: { text: string; type: "text" }[];
  isError?: boolean;
};

const text = (value: string, isError = false): ToolAnswer => ({
  content: [{ text: value, type: "text" }],
  ...(isError ? { isError: true } : {}),
});

// A domain failure (no such note, not transcribed yet) is an answer the agent can act on, so it is
// a tool result and not a protocol error. Anything else names nothing: the stack is in the log.
const answer = async (
  tool: string,
  read: () => Promise<string>
): Promise<ToolAnswer> => {
  try {
    return text(await read());
  } catch (failure) {
    if (isAppError(failure)) {
      return text(`${failure._tag}: ${failure.message}`, true);
    }
    logEvent("mcp.tool.failed", { tool });
    console.error(failure);
    return text("Internal", true);
  }
};

const json = (value: unknown): string => JSON.stringify(value, null, 2);

const clock = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

// Lines, not JSON: a transcript is the largest thing this server returns, and a line per utterance
// costs an agent a fraction of the tokens the same utterance costs as an object.
export const renderTranscript = (transcript: Transcript): string =>
  transcript.utterances.length === 0
    ? "(The recording was silent: there is nothing to read.)"
    : transcript.utterances
        .map((u) => `[${clock(u.startMs)}] Speaker ${u.speaker}: ${u.text}`)
        .join("\n");

const NoteArgs = z.object({
  id: z
    .string()
    .min(1)
    .describe("A note id, as list_notes or search_notes returned it"),
});

const READ_ONLY = { openWorldHint: false, readOnlyHint: true } as const;

// Built per request by `Http.ts`: the SDK's stateless handler wants a fresh server each time, and
// closing over the actor is what scopes every read to the owner.
export const buildMcpServer = (svc: McpReads, actor: Actor): McpServer => {
  const server = new McpServer({ name: BRAND.slug, version: "1.0.0" });

  server.registerTool(
    "list_notes",
    {
      annotations: READ_ONLY,
      description:
        "The owner's meeting notes, newest first: id, title, start time and attendees, without bodies. Pass the previous answer's nextCursor as cursor for the next page; nextCursor is null on the last page.",
      inputSchema: z.object({
        cursor: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
      }),
      title: "List notes",
    },
    (args) =>
      answer("list_notes", async () => {
        const query = PageQuery.safeParse({
          cursor: args.cursor ?? null,
          limit: args.limit,
        });
        if (!query.success) {
          return "That cursor was not issued by list_notes. Call it again without a cursor.";
        }
        return json(await svc.notes.list(actor, query.data));
      })
  );

  server.registerTool(
    "get_note",
    {
      annotations: READ_ONLY,
      description:
        "One note in full: the written notes as Markdown (bodyMarkdown), attendees, folders, and the state of its recording and AI summary.",
      inputSchema: NoteArgs,
      title: "Read a note",
    },
    (args) =>
      answer("get_note", async () => json(await svc.notes.get(actor, args.id)))
  );

  server.registerTool(
    "get_transcript",
    {
      annotations: READ_ONLY,
      description:
        "The full transcript of a note's recording, one line per utterance: [mm:ss] Speaker A: text. Speakers are letters, not names. Answers TranscriptNotFound for a note that was typed by hand or is not transcribed yet.",
      inputSchema: NoteArgs,
      title: "Read a transcript",
    },
    (args) =>
      answer("get_transcript", async () =>
        renderTranscript(await svc.recordings.transcript(actor, args.id))
      )
  );

  server.registerTool(
    "search_notes",
    {
      annotations: READ_ONLY,
      description:
        "Notes and people matching a word or phrase. Returns ids and titles; read a hit with get_note or get_transcript.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(SEARCH_QUERY_MAX),
      }),
      title: "Search notes",
    },
    (args) =>
      answer("search_notes", async () =>
        json(await svc.search.search(actor, { q: args.query }))
      )
  );

  return server;
};
