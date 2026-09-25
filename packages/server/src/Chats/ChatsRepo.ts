import {
  and,
  chatMessages,
  chatPreferences,
  chatThreads,
  desc,
  eq,
  inArray,
  isNull,
  noteAttendees,
  notes,
  or,
  recordings,
  type SQL,
  sql,
  transcriptSegments,
  user,
} from "@gc/db";
import {
  ActivityStep,
  CHAT_PREVIEW_MAX,
  CHAT_STREAM_STALE_AFTER_MS,
  CHAT_THREAD_MAX_MESSAGES,
  type ChatFeedback,
  type ChatMessage,
  ChatMessageId,
  ChatMessageRole,
  ChatMessageStatus,
  ChatModelId,
  type ChatScope,
  ChatThreadId,
  type ChatThreadSummary,
  Citation,
} from "@gc/domain/Domain/Chat";
import { NoteId, UserId } from "@gc/domain/Domain/Ids";
import { PersonKey } from "@gc/domain/Domain/Person";
import type { Timestamp } from "@gc/domain/Domain/Time";
import { z } from "zod";
import type { DrizzleClient } from "../Runtime/Drizzle";
import type { ChatsPosition } from "./Cursor";
import type { RetrievedNote } from "./Retrieval";

// Which notes an answer may read. Every retrieval query also filters on the owner and on
// `trashed_at is null`; the scope only ever narrows that, never widens it.
export type RetrievalScope =
  | { readonly kind: "global" }
  | { readonly kind: "note"; readonly noteId: NoteId }
  | { readonly kind: "person"; readonly personKey: PersonKey };

// A message as stored: its position is what the retry and the next turn are placed by, and never
// on the wire.
export type StoredMessage = ChatMessage & {
  readonly attempt: number;
  readonly position: number;
};

// The thread plus its owner, which the policy compares and is never on the wire.
export type ChatThreadRecord = ChatThreadSummary & { readonly ownerId: UserId };

export type ChatThreadWithMessages = ChatThreadRecord & {
  readonly messages: readonly StoredMessage[];
};

export type NewThread = {
  readonly id: ChatThreadId;
  readonly ownerId: UserId;
  readonly personName: string | null;
  readonly scope: RetrievalScope;
  readonly title: string;
};

export type NewMessage = {
  readonly content: string;
  readonly id: ChatMessageId;
  readonly model: ChatModelId | null;
  readonly position: number;
  readonly role: "assistant" | "user";
  readonly status: "complete" | "streaming";
};

export type Answer = {
  readonly activity: readonly ActivityStep[];
  readonly citations: readonly Citation[];
  readonly content: string;
};

const Activity = z.array(ActivityStep);
const Citations = z.array(Citation);

// A row that fails to parse reads as `[]`, never throws: one bad blob must not make a thread
// unreadable.
const jsonArray = <A>(schema: z.ZodType<A[]>, text: string): A[] => {
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
};

const LIKE_SPECIALS = /[\\%_]/g;
const containing = (text: string): string =>
  `%${text.toLowerCase().replace(LIKE_SPECIALS, (char) => `\\${char}`)}%`;

const NEWLINES = /\s*\n\s*/g;
const previewOf = (content: string | null): string =>
  (content ?? "").replace(NEWLINES, " ").trim().slice(0, CHAT_PREVIEW_MAX);

// Written qualified by hand, as in the notes repository: inside a single-table select drizzle
// renders a column unqualified, and an unqualified `id` in a subquery binds to the inner table.
const lastAnswer = sql<
  string | null
>`(select "m"."content" from "chat_messages" "m" where "m"."thread_id" = "chat_threads"."id" and "m"."role" = 'assistant' and "m"."status" = 'complete' order by "m"."position" desc limit 1)`;

// The same expression `chat_threads_owner_rank_idx` is built on, so SQLite serves the history
// order from the index rather than sorting: an index on raw `pinned_at` cannot serve an order on a
// derived rank.
const pinnedRank = sql<number>`(${chatThreads.pinnedAt} is not null)`;

const summaryColumns = {
  id: chatThreads.id,
  noteTitle: notes.title,
  noteTrashedAt: notes.trashedAt,
  ownerId: chatThreads.ownerId,
  pinnedAt: chatThreads.pinnedAt,
  preview: lastAnswer,
  scopeKind: chatThreads.scopeKind,
  scopeNoteId: chatThreads.scopeNoteId,
  scopePersonKey: chatThreads.scopePersonKey,
  scopePersonName: chatThreads.scopePersonName,
  title: chatThreads.title,
  updatedAt: chatThreads.updatedAt,
};

type SummaryRow = {
  readonly id: string;
  readonly noteTitle: string | null;
  readonly noteTrashedAt: number | null;
  readonly ownerId: string;
  readonly pinnedAt: number | null;
  readonly preview: string | null;
  readonly scopeKind: string;
  readonly scopeNoteId: string | null;
  readonly scopePersonKey: string | null;
  readonly scopePersonName: string | null;
  readonly title: string;
  readonly updatedAt: number;
};

// The note's live title, or null once it is trashed: a trashed note labels nothing.
const scopeOf = (row: SummaryRow): ChatScope => {
  if (row.scopeKind === "note" && row.scopeNoteId !== null) {
    return {
      kind: "note",
      label: row.noteTrashedAt === null ? row.noteTitle : null,
      noteId: NoteId.parse(row.scopeNoteId),
    };
  }
  if (row.scopeKind === "person" && row.scopePersonKey !== null) {
    return {
      kind: "person",
      label: row.scopePersonName,
      personKey: PersonKey.parse(row.scopePersonKey),
    };
  }
  return { kind: "global", label: null };
};

const toRecord = (row: SummaryRow): ChatThreadRecord => ({
  id: ChatThreadId.parse(row.id),
  ownerId: UserId.parse(row.ownerId),
  pinned: row.pinnedAt !== null,
  preview: previewOf(row.preview),
  scope: scopeOf(row),
  title: row.title,
  updatedAt: row.updatedAt,
});

type MessageRow = typeof chatMessages.$inferSelect;

// A `streaming` row older than the cutoff reads as `failed`: the isolate that owned it is gone,
// and Retry is the recovery. Derived here, at read time, from the `now` the service passes.
const toMessage = (row: MessageRow, now: Timestamp): StoredMessage => {
  const status = ChatMessageStatus.parse(row.status);
  const stale =
    status === "streaming" && now - row.updatedAt > CHAT_STREAM_STALE_AFTER_MS;
  const model = ChatModelId.safeParse(row.model);
  const feedback = z.enum(["up", "down"]).safeParse(row.feedback);
  return {
    activity: jsonArray(Activity, row.activity),
    attempt: row.attempt,
    citations: jsonArray(Citations, row.citations),
    content: row.content,
    createdAt: row.createdAt,
    feedback: feedback.success ? feedback.data : null,
    id: ChatMessageId.parse(row.id),
    model: model.success ? model.data : null,
    position: row.position,
    role: ChatMessageRole.parse(row.role),
    status: stale ? "failed" : status,
  };
};

const liveNotesOf = (ownerId: UserId) =>
  and(eq(notes.ownerId, ownerId), isNull(notes.trashedAt));

// The attendee match for a person key, over `note_attendees` "a" and `user` "u" as the caller
// aliases them. A linked account's address and name win over the stored copy, as on the attendees
// sheet. A `name:` key matches only an attendee with no address, because `personKeyOf` prefers the
// address whenever there is one.
const attendeeMatches = (
  key: PersonKey,
  columns: { email: SQL; name: SQL }
): SQL => {
  const value = key.slice(key.indexOf(":") + 1);
  return key.startsWith("email:")
    ? sql`lower(trim(${columns.email})) = ${value}`
    : sql`coalesce(${columns.email}, '') = '' and lower(trim(${columns.name})) = ${value}`;
};

const QUALIFIED = {
  email: sql`coalesce("u"."email", "a"."email")`,
  name: sql`coalesce("u"."name", "a"."name")`,
};

const scopeFilter = (scope: RetrievalScope): SQL | undefined => {
  switch (scope.kind) {
    case "note":
      return eq(notes.id, scope.noteId);
    case "person":
      return sql`exists (select 1 from "note_attendees" "a" left join "user" "u" on "u"."id" = "a"."user_id" where "a"."note_id" = "notes"."id" and ${attendeeMatches(scope.personKey, QUALIFIED)})`;
    default:
      return;
  }
};

// A substring prefilter, so the service's word scoring runs over a bounded set rather than every
// note the caller has. It is a superset of what scores: `scoreNote` still decides.
const mentionsAny = (terms: readonly string[]): SQL | undefined =>
  or(
    ...terms.map((term) => {
      const pattern = containing(term);
      return sql`(lower(${notes.title}) like ${pattern} escape '\\' or lower(${notes.bodyMarkdown}) like ${pattern} escape '\\' or exists (select 1 from "transcript_segments" "s" join "recordings" "r" on "r"."id" = "s"."recording_id" where "r"."note_id" = "notes"."id" and lower("s"."text") like ${pattern} escape '\\'))`;
    })
  );

const noteColumns = {
  bodyMarkdown: notes.bodyMarkdown,
  id: notes.id,
  startedAt: notes.startedAt,
  title: notes.title,
};

const UNIQUE_FAILED = /UNIQUE constraint failed/;

// No policy and no clock: every method takes the owner it filters on and the time it stamps or
// compares, and answers `null` or `false` for a row it did not find or did not change.
export const makeChatsRepo = (db: DrizzleClient) => {
  const summaryRows = () =>
    db
      .select(summaryColumns)
      .from(chatThreads)
      .leftJoin(notes, eq(notes.id, chatThreads.scopeNoteId));

  // The transcript joined per note in one query, a line per segment so the answer's line picker
  // reads it the way it reads a body.
  const withTranscripts = async (
    ownerId: UserId,
    rows: readonly {
      bodyMarkdown: string;
      id: string;
      startedAt: number;
      title: string;
    }[]
  ): Promise<RetrievedNote[]> => {
    const ids = rows.map((row) => row.id);
    const segments =
      ids.length === 0
        ? []
        : await db
            .select({
              noteId: recordings.noteId,
              text: transcriptSegments.text,
            })
            .from(transcriptSegments)
            .innerJoin(
              recordings,
              eq(recordings.id, transcriptSegments.recordingId)
            )
            .where(
              and(
                eq(recordings.ownerId, ownerId),
                inArray(recordings.noteId, ids)
              )
            )
            .orderBy(recordings.noteId, transcriptSegments.position)
            .all();
    return rows.map((row) => ({
      bodyMarkdown: row.bodyMarkdown,
      noteId: NoteId.parse(row.id),
      startedAt: row.startedAt,
      title: row.title,
      transcriptText: segments
        .filter((segment) => segment.noteId === row.id)
        .map((segment) => segment.text)
        .join("\n"),
    }));
  };

  const touch = async (threadId: string, now: Timestamp) => {
    await db
      .update(chatThreads)
      .set({ updatedAt: now })
      .where(eq(chatThreads.id, threadId))
      .run();
  };

  return {
    // Notes in scope that mention any term, newest first. Owner and liveness are in the `where`
    // whatever the scope, which is the whole of the guarantee that retrieval never crosses users.
    candidates: async (
      ownerId: UserId,
      scope: RetrievalScope,
      terms: readonly string[],
      limit: number
    ): Promise<RetrievedNote[]> => {
      const mentions = scope.kind === "note" ? undefined : mentionsAny(terms);
      if (scope.kind !== "note" && mentions === undefined) {
        return [];
      }
      const rows = await db
        .select(noteColumns)
        .from(notes)
        .where(and(liveNotesOf(ownerId), scopeFilter(scope), mentions))
        .orderBy(desc(notes.startedAt), desc(notes.id))
        .limit(limit)
        .all();
      return await withTranscripts(ownerId, rows);
    },

    // One conditional update is the claim: of two retries of one answer exactly one matches. A
    // `streaming` row counts only once it is stale, so a live answer cannot be restarted under
    // itself.
    claimRetry: async (
      ownerId: UserId,
      threadId: ChatThreadId,
      id: ChatMessageId,
      now: Timestamp
    ): Promise<StoredMessage | null> => {
      const [row] = await db
        .update(chatMessages)
        .set({
          activity: "[]",
          attempt: sql`${chatMessages.attempt} + 1`,
          citations: "[]",
          content: "",
          failure: null,
          status: "streaming",
          updatedAt: now,
        })
        .where(
          and(
            eq(chatMessages.id, id),
            eq(chatMessages.threadId, threadId),
            eq(chatMessages.ownerId, ownerId),
            eq(chatMessages.role, "assistant"),
            or(
              eq(chatMessages.status, "failed"),
              and(
                eq(chatMessages.status, "streaming"),
                sql`${chatMessages.updatedAt} < ${now - CHAT_STREAM_STALE_AFTER_MS}`
              )
            )
          )
        )
        .returning()
        .all();
      return row === undefined ? null : toMessage(row, now);
    },

    // Latched on `status = 'streaming'` and on the run's `attempt`: a retry sets the row back to
    // `streaming` and bumps the attempt, so the status alone would let a late original finish over
    // the retry streaming into the same row. `null` when the latch was lost.
    completeAnswer: async (
      ownerId: UserId,
      id: ChatMessageId,
      attempt: number,
      answer: Answer,
      now: Timestamp
    ): Promise<StoredMessage | null> => {
      const [row] = await db
        .update(chatMessages)
        .set({
          activity: JSON.stringify(answer.activity),
          citations: JSON.stringify(answer.citations),
          content: answer.content,
          failure: null,
          status: "complete",
          updatedAt: now,
        })
        .where(
          and(
            eq(chatMessages.id, id),
            eq(chatMessages.ownerId, ownerId),
            eq(chatMessages.attempt, attempt),
            eq(chatMessages.status, "streaming")
          )
        )
        .returning()
        .all();
      if (row === undefined) {
        return null;
      }
      await touch(row.threadId, now);
      return toMessage(row, now);
    },

    // The same latch. What was streamed so far is dropped: a failed answer shows no half sentence.
    failAnswer: async (
      ownerId: UserId,
      id: ChatMessageId,
      attempt: number,
      failure: string,
      now: Timestamp
    ): Promise<boolean> => {
      const result = await db
        .update(chatMessages)
        .set({ content: "", failure, status: "failed", updatedAt: now })
        .where(
          and(
            eq(chatMessages.id, id),
            eq(chatMessages.ownerId, ownerId),
            eq(chatMessages.attempt, attempt),
            eq(chatMessages.status, "streaming")
          )
        )
        .run();
      return result.meta.changes > 0;
    },

    // Pinned first, then `updatedAt desc, id desc`, strictly after the cursor. The row-value
    // comparison is the same order the `orderBy` uses, so no row is skipped or repeated.
    list: async (
      ownerId: UserId,
      query: {
        readonly limit: number;
        readonly position: ChatsPosition | null;
        readonly q: string | null;
      }
    ): Promise<ChatThreadRecord[]> => {
      const pattern = query.q === null ? null : containing(query.q);
      const rows = await summaryRows()
        .where(
          and(
            eq(chatThreads.ownerId, ownerId),
            pattern === null
              ? undefined
              : sql`(lower(${chatThreads.title}) like ${pattern} escape '\\' or exists (select 1 from "chat_messages" "m" where "m"."thread_id" = "chat_threads"."id" and lower("m"."content") like ${pattern} escape '\\'))`,
            query.position === null
              ? undefined
              : sql`(${pinnedRank}, ${chatThreads.updatedAt}, ${chatThreads.id}) < (${query.position.pinned}, ${query.position.updatedAt}, ${query.position.id})`
          )
        )
        .orderBy(
          desc(pinnedRank),
          desc(chatThreads.updatedAt),
          desc(chatThreads.id)
        )
        .limit(query.limit)
        .all();
      return rows.map(toRecord);
    },

    ownsLiveNote: async (ownerId: UserId, noteId: NoteId): Promise<boolean> => {
      const row = await db
        .select({ id: notes.id })
        .from(notes)
        .where(and(liveNotesOf(ownerId), eq(notes.id, noteId)))
        .get();
      return row !== undefined;
    },

    // The most recent display name the person appears under among the caller's live notes, the
    // caller's own row included (its name and address come from `user`). `null` when none has them.
    personForOwner: async (
      ownerId: UserId,
      key: PersonKey
    ): Promise<{ readonly name: string } | null> => {
      const email = sql<
        string | null
      >`coalesce(${user.email}, ${noteAttendees.email})`;
      const name = sql<
        string | null
      >`coalesce(${user.name}, ${noteAttendees.name})`;
      const row = await db
        .select({ email, name })
        .from(noteAttendees)
        .innerJoin(notes, eq(notes.id, noteAttendees.noteId))
        .leftJoin(user, eq(user.id, noteAttendees.userId))
        .where(and(liveNotesOf(ownerId), attendeeMatches(key, { email, name })))
        .orderBy(desc(notes.startedAt), desc(notes.id))
        .get();
      if (row === undefined) {
        return null;
      }
      return { name: row.name ?? row.email ?? key.slice(key.indexOf(":") + 1) };
    },

    // `null` when nothing is stored, which means the default: reading never writes a row.
    preferenceOf: async (userId: UserId): Promise<ChatModelId | null> => {
      const row = await db
        .select({ model: chatPreferences.model })
        .from(chatPreferences)
        .where(eq(chatPreferences.userId, userId))
        .get();
      const parsed = ChatModelId.safeParse(row?.model);
      return parsed.success ? parsed.data : null;
    },

    recent: async (
      ownerId: UserId,
      scope: RetrievalScope,
      limit: number
    ): Promise<RetrievedNote[]> => {
      const rows = await db
        .select(noteColumns)
        .from(notes)
        .where(and(liveNotesOf(ownerId), scopeFilter(scope)))
        .orderBy(desc(notes.startedAt), desc(notes.id))
        .limit(limit)
        .all();
      return await withTranscripts(ownerId, rows);
    },

    // A hard delete; the messages go with it through the foreign key's cascade.
    remove: async (ownerId: UserId, id: ChatThreadId): Promise<boolean> => {
      const result = await db
        .delete(chatThreads)
        .where(and(eq(chatThreads.id, id), eq(chatThreads.ownerId, ownerId)))
        .run();
      return result.meta.changes > 0;
    },

    setFeedback: async (
      ownerId: UserId,
      id: ChatMessageId,
      feedback: ChatFeedback | null,
      now: Timestamp
    ): Promise<StoredMessage | null> => {
      const [row] = await db
        .update(chatMessages)
        .set({ feedback })
        .where(
          and(
            eq(chatMessages.id, id),
            eq(chatMessages.ownerId, ownerId),
            eq(chatMessages.role, "assistant")
          )
        )
        .returning()
        .all();
      return row === undefined ? null : toMessage(row, now);
    },

    setPinned: async (
      ownerId: UserId,
      id: ChatThreadId,
      pinnedAt: Timestamp | null
    ): Promise<boolean> => {
      const result = await db
        .update(chatThreads)
        .set({ pinnedAt })
        .where(and(eq(chatThreads.id, id), eq(chatThreads.ownerId, ownerId)))
        .run();
      return result.meta.changes > 0;
    },

    setPreference: async (
      userId: UserId,
      model: ChatModelId,
      now: Timestamp
    ): Promise<void> => {
      await db
        .insert(chatPreferences)
        .values({ model, updatedAt: now, userId })
        .onConflictDoUpdate({
          set: { model, updatedAt: now },
          target: chatPreferences.userId,
        })
        .run();
    },

    summary: async (id: ChatThreadId): Promise<ChatThreadRecord | null> => {
      const row = await summaryRows().where(eq(chatThreads.id, id)).get();
      return row === undefined ? null : toRecord(row);
    },

    // The last CHAT_THREAD_MAX_MESSAGES in order: a thread that long is read from its end.
    thread: async (
      id: ChatThreadId,
      now: Timestamp
    ): Promise<ChatThreadWithMessages | null> => {
      const row = await summaryRows().where(eq(chatThreads.id, id)).get();
      if (row === undefined) {
        return null;
      }
      const messages = await db
        .select()
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.threadId, id),
            eq(chatMessages.ownerId, row.ownerId)
          )
        )
        .orderBy(desc(chatMessages.position))
        .limit(CHAT_THREAD_MAX_MESSAGES)
        .all();
      return {
        ...toRecord(row),
        messages: messages.reverse().map((message) => toMessage(message, now)),
      };
    },

    // The thread (when new) first, then both messages in one statement, then the thread's clock.
    // D1 gives a repository no transaction, so the order is what limits a partial write: a thread
    // with no messages is an empty history row, never a message without its thread. `false` when a
    // concurrent send took the same positions, which the unique index refuses.
    writeTurn: async (turn: {
      readonly messages: readonly NewMessage[];
      readonly now: Timestamp;
      readonly ownerId: UserId;
      readonly thread: NewThread | null;
      readonly threadId: ChatThreadId;
    }): Promise<boolean> => {
      if (turn.thread !== null) {
        const { scope } = turn.thread;
        await db
          .insert(chatThreads)
          .values({
            createdAt: turn.now,
            id: turn.thread.id,
            ownerId: turn.ownerId,
            pinnedAt: null,
            scopeKind: scope.kind,
            scopeNoteId: scope.kind === "note" ? scope.noteId : null,
            scopePersonKey: scope.kind === "person" ? scope.personKey : null,
            scopePersonName:
              scope.kind === "person" ? turn.thread.personName : null,
            title: turn.thread.title,
            updatedAt: turn.now,
          })
          .run();
      }
      try {
        await db
          .insert(chatMessages)
          .values(
            turn.messages.map((message) => ({
              ...message,
              createdAt: turn.now,
              ownerId: turn.ownerId,
              threadId: turn.threadId,
              updatedAt: turn.now,
            }))
          )
          .run();
      } catch (error) {
        if (
          error instanceof Error &&
          UNIQUE_FAILED.test(String(error.cause ?? error.message))
        ) {
          return false;
        }
        throw error;
      }
      await touch(turn.threadId, turn.now);
      return true;
    },
  };
};

export type ChatsRepo = ReturnType<typeof makeChatsRepo>;
