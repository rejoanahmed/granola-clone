import {
  and,
  asc,
  eq,
  folderNotes,
  folders,
  isNull,
  notes,
  type SQL,
  sql,
} from "@gc/db";
import { FolderId, UserId } from "@gc/domain/Domain/Ids";
import type { NoteId } from "@gc/domain/Domain/Note";
import type { Timestamp } from "@gc/domain/Domain/Time";
import type { DrizzleClient } from "../Runtime/Drizzle";
import type { Stage, StatementRef } from "../Runtime/UnitOfWork";

// The folder plus its owner. `ownerId` is what the policy compares and is never on the wire.
export type FolderRecord = {
  readonly createdAt: Timestamp;
  readonly id: FolderId;
  readonly name: string;
  readonly noteCount: number;
  readonly ownerId: UserId;
  readonly updatedAt: Timestamp;
};

export type NewFolder = Omit<FolderRecord, "noteCount"> & {
  readonly nameKey: string;
};

const UNIQUE_FAILED = /UNIQUE constraint failed/;

// Live members only. The second left join carries the trash test in its `on`, so a folder whose
// members are all trashed still has a row, and counts `notes.id` (null for a trashed member) as 0.
const withCounts = (db: DrizzleClient, where: SQL | undefined) =>
  db
    .select({
      createdAt: folders.createdAt,
      id: folders.id,
      name: folders.name,
      noteCount: sql<number>`count(${notes.id})`,
      ownerId: folders.ownerId,
      updatedAt: folders.updatedAt,
    })
    .from(folders)
    .leftJoin(folderNotes, eq(folderNotes.folderId, folders.id))
    .leftJoin(
      notes,
      and(eq(notes.id, folderNotes.noteId), isNull(notes.trashedAt))
    )
    .where(where)
    .groupBy(folders.id)
    .orderBy(asc(folders.nameKey), asc(folders.id));

type CountedRow = {
  readonly createdAt: number;
  readonly id: string;
  readonly name: string;
  readonly noteCount: number;
  readonly ownerId: string;
  readonly updatedAt: number;
};

const isMember = (folderId: FolderId, noteId: NoteId): SQL =>
  sql`exists (select 1 from ${folderNotes} where ${folderNotes.folderId} = ${folderId} and ${folderNotes.noteId} = ${noteId})`;

const not = (condition: SQL): SQL => sql`not ${condition}`;

const toRecord = (row: CountedRow): FolderRecord => ({
  createdAt: row.createdAt,
  id: FolderId.parse(row.id),
  name: row.name,
  noteCount: Number(row.noteCount),
  ownerId: UserId.parse(row.ownerId),
  updatedAt: row.updatedAt,
});

// No policy and no clock: every method takes the owner it filters on and the time it stamps, and
// answers `null` or `false` for a row it did not find or did not change.
export const makeFoldersRepo = (db: DrizzleClient) => ({
  findForOwner: async (
    ownerId: UserId,
    id: FolderId
  ): Promise<FolderRecord | null> => {
    const row = await withCounts(
      db,
      and(eq(folders.ownerId, ownerId), eq(folders.id, id))
    ).get();
    return row === undefined ? null : toRecord(row);
  },

  // One statement decides both refusals, so neither a prior read nor a race can win: the unique
  // index refuses the name, and the `where` refuses the insert once the owner holds `max`.
  insert: async (
    folder: NewFolder,
    max: number
  ): Promise<"created" | "limit-reached" | "name-taken"> => {
    try {
      const result = await db.run(
        sql`insert into folders (created_at, id, name, name_key, owner_id, updated_at)
          select ${folder.createdAt}, ${folder.id}, ${folder.name}, ${folder.nameKey}, ${folder.ownerId}, ${folder.updatedAt}
          where (select count(*) from folders where owner_id = ${folder.ownerId}) < ${max}`
      );
      return result.meta.changes > 0 ? "created" : "limit-reached";
    } catch (error) {
      if (
        error instanceof Error &&
        UNIQUE_FAILED.test(String(error.cause ?? error.message))
      ) {
        return "name-taken";
      }
      throw error;
    }
  },

  // One query, with the counts grouped in it: never a count per folder.
  listForOwner: async (ownerId: UserId): Promise<FolderRecord[]> =>
    (await withCounts(db, eq(folders.ownerId, ownerId)).all()).map(toRecord),

  // The touch is staged first and guarded on the membership being absent, so it matches exactly
  // when the insert after it writes a row. One batch: `updatedAt` cannot be left behind a
  // membership that landed, which a retry would then find already written.
  stageAddNote: (
    stage: Stage,
    folderId: FolderId,
    noteId: NoteId,
    now: Timestamp
  ): StatementRef => {
    const changed = stage.add({
      query: db
        .update(folders)
        .set({ updatedAt: now })
        .where(and(eq(folders.id, folderId), not(isMember(folderId, noteId)))),
    });
    stage.add({
      query: db
        .insert(folderNotes)
        .values({ addedAt: now, folderId, noteId })
        .onConflictDoNothing(),
    });
    return changed;
  },
  // The memberships go first and by hand, so the answer does not depend on `foreign_keys` being on
  // (D1 enforces it; a bare SQLite does not). One batch, so a folder is never left half-deleted.
  stageDelete: (stage: Stage, id: FolderId): StatementRef => {
    stage.add({
      query: db.delete(folderNotes).where(eq(folderNotes.folderId, id)),
    });
    return stage.add({ query: db.delete(folders).where(eq(folders.id, id)) });
  },

  // The mirror of `stageAddNote`: guarded on the membership being present, before the delete.
  stageRemoveNote: (
    stage: Stage,
    folderId: FolderId,
    noteId: NoteId,
    now: Timestamp
  ): StatementRef => {
    const changed = stage.add({
      query: db
        .update(folders)
        .set({ updatedAt: now })
        .where(and(eq(folders.id, folderId), isMember(folderId, noteId))),
    });
    stage.add({
      query: db
        .delete(folderNotes)
        .where(
          and(
            eq(folderNotes.folderId, folderId),
            eq(folderNotes.noteId, noteId)
          )
        ),
    });
    return changed;
  },
});

export type FoldersRepo = ReturnType<typeof makeFoldersRepo>;
