import {
  AttendeeId,
  type AttendeeInput,
  DEFAULT_NOTE_TITLE,
  type Note,
  type NoteCreate,
  NoteId,
  type NotePatch,
  type NoteSummary,
} from "@gc/domain/Domain/Note";
import type { Page, PageQuery } from "@gc/domain/Domain/Page";
import type { PersonKey } from "@gc/domain/Domain/Person";
import { ValidationFailed } from "@gc/domain/Errors";
import { NoteNotFound, NoteTrashed } from "@gc/domain/Notes/Errors";
import type { Actor } from "../Auth/Actor";
import { type Authorized, ensure, type Policy } from "../Auth/Policy";
import type { Clock } from "../Runtime/Clock";
import type { Ids } from "../Runtime/Ids";
import type { UnitOfWork } from "../Runtime/UnitOfWork";
import { decodeCursor, encodeCursor, type NotesPosition } from "./Cursor";
import type { NewAttendee, NoteRecord, NotesRepo } from "./NotesRepo";
import { canEditNote, canReadNote } from "./Policy";

export type NotesDeps = {
  readonly clock: Clock;
  readonly ids: Ids;
  readonly repo: NotesRepo;
  readonly uow: UnitOfWork;
};

// The id is taken as a plain string because the route has already validated it and a test or a
// cron may hold one it never parsed; a string that is not a note id cannot name a note.
type NoteRef = string;

// `NoteCreate` as a caller may hold it: a cron or a test building the input need not copy an
// immutable array to satisfy zod's mutable output type.
export type NewNoteInput = Omit<NoteCreate, "attendees"> & {
  readonly attendees?: readonly AttendeeInput[];
};

const hasChanges = (patch: NotePatch): boolean =>
  Object.values(patch).some((value) => value !== undefined);

// The wire shape. Taking `Authorized<NoteRecord>` is what makes a method that skipped its check
// fail to compile where it answers.
const present = (note: Authorized<NoteRecord>, actor: Actor): Note => ({
  attendees: [...note.attendees]
    .map((attendee) => ({
      email: attendee.email,
      id: attendee.id,
      isMe: attendee.userId === actor.id,
      name: attendee.name,
    }))
    // Stable, so everyone but the caller keeps their stored order.
    .sort((a, b) => Number(b.isMe) - Number(a.isMe)),
  bodyMarkdown: note.bodyMarkdown,
  createdAt: note.createdAt,
  // Phase 9 contract stub: the server build fills this from the note's folder_notes rows.
  folderIds: [],
  generation: note.generation,
  id: note.id,
  recording: note.recording,
  source: note.source,
  startedAt: note.startedAt,
  title: note.title,
  trashedAt: note.trashedAt,
  updatedAt: note.updatedAt,
});

const cursorOf = (cursor: string | null): NotesPosition | null => {
  if (cursor === null) {
    return null;
  }
  const position = decodeCursor(cursor);
  if (position === null) {
    throw new ValidationFailed({ field: "cursor" }, "Unreadable cursor");
  }
  return position;
};

export const makeNotesService = (deps: NotesDeps) => {
  // Absent and not-yours are one answer, carrying only the id the caller sent: anything else would
  // confirm to a stranger that the id exists (D018). The brand is applied only after `holds`.
  const visible = async (
    policy: Policy<NoteRecord>,
    actor: Actor,
    id: NoteRef
  ): Promise<Authorized<NoteRecord>> => {
    const parsed = NoteId.safeParse(id);
    const note = parsed.success ? await deps.repo.byId(parsed.data) : null;
    if (note === null || !policy.holds(note, actor)) {
      throw new NoteNotFound({ id });
    }
    return ensure(policy, note, actor);
  };

  // Every write answers through this, so the answer to an edit can never be a read that skipped
  // the read policy.
  const get = async (actor: Actor, id: NoteRef): Promise<Note> =>
    present(await visible(canReadNote, actor, id), actor);

  return {
    create: async (actor: Actor, input: NewNoteInput): Promise<Note> => {
      const now = deps.clock.now();
      const id = NoteId.parse(deps.ids.generate("not_"));
      const owner: NewAttendee = {
        email: null,
        id: AttendeeId.parse(deps.ids.generate("att_")),
        name: null,
        position: 0,
        userId: actor.id,
      };
      const guests: NewAttendee[] = (input.attendees ?? []).map(
        (attendee, index) => ({
          email: attendee.email ?? null,
          id: AttendeeId.parse(deps.ids.generate("att_")),
          name: attendee.name ?? null,
          position: index + 1,
          userId: null,
        })
      );
      await deps.uow.commit((stage) =>
        deps.repo.stageCreate(
          stage,
          {
            bodyMarkdown: input.bodyMarkdown ?? "",
            createdAt: now,
            id,
            ownerId: actor.id,
            source: "phone",
            startedAt: input.startedAt ?? now,
            title: input.title ?? DEFAULT_NOTE_TITLE,
            updatedAt: now,
          },
          [owner, ...guests]
        )
      );
      return get(actor, id);
    },

    get,

    // One more row than the page, so `nextCursor` is set exactly when the extra row exists — no
    // count, and no second query that could disagree with the page it describes.
    list: async (
      actor: Actor,
      query: PageQuery & { readonly person?: PersonKey }
    ): Promise<Page<NoteSummary>> => {
      const rows = await deps.repo.listLive(
        actor.id,
        cursorOf(query.cursor),
        query.limit + 1,
        query.person ?? null
      );
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          rows.length > query.limit && last !== undefined
            ? encodeCursor({ id: last.id, startedAt: last.startedAt })
            : null,
      };
    },

    // Idempotent: restoring a live note writes nothing and answers it as it is.
    restore: async (actor: Actor, id: NoteRef): Promise<Note> => {
      const note = await visible(canEditNote, actor, id);
      await deps.repo.restore(note.id, deps.clock.now());
      return get(actor, id);
    },

    // Idempotent: the repo stamps only a live note, so a second trash keeps the first stamp.
    trash: async (actor: Actor, id: NoteRef): Promise<Note> => {
      const note = await visible(canEditNote, actor, id);
      await deps.repo.trash(note.id, deps.clock.now());
      return get(actor, id);
    },

    // A trashed note is a 409 rather than a silent restore, checked before `{}` is recognised, so a
    // no-op patch on a trashed note is a 409 too. `{}` on a live note writes nothing and does not
    // move `updatedAt`. The repo's guard catches a note trashed between this read and the write.
    update: async (
      actor: Actor,
      id: NoteRef,
      patch: NotePatch
    ): Promise<Note> => {
      const note = await visible(canEditNote, actor, id);
      if (note.trashedAt !== null) {
        throw new NoteTrashed({ id });
      }
      if (
        hasChanges(patch) &&
        !(await deps.repo.update(note.id, patch, deps.clock.now()))
      ) {
        // Gone since the read (`get` answers NoteNotFound) or trashed since it.
        await get(actor, id);
        throw new NoteTrashed({ id });
      }
      return get(actor, id);
    },
  };
};

export type NotesService = ReturnType<typeof makeNotesService>;
