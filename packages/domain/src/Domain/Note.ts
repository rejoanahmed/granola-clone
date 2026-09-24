import { z } from "zod";
import { branded } from "./Ids";
import { Timestamp } from "./Time";

export const NoteId = branded("NoteId", "not_");
export type NoteId = z.infer<typeof NoteId>;

export const AttendeeId = branded("AttendeeId", "att_");
export type AttendeeId = z.infer<typeof AttendeeId>;

// One value until recording lands (phase 5). An enum rather than a literal, so a client switching
// on it already has the exhaustiveness check that phase will need.
export const NoteSource = z.enum(["phone"]);
export type NoteSource = z.infer<typeof NoteSource>;

// A named constant because the rename sheet caps its field at it: a client-side copy would drift,
// and a title the field allowed would come back as a 422.
export const NOTE_TITLE_MAX = 200;

// Trimmed before the length check, so "   " is empty rather than a three-character title.
export const NoteTitle = z.string().trim().min(1).max(NOTE_TITLE_MAX);
export type NoteTitle = z.infer<typeof NoteTitle>;

export const NoteBody = z.string().max(100_000);
export type NoteBody = z.infer<typeof NoteBody>;

export const DEFAULT_NOTE_TITLE = "Untitled note";

// `isMe` is computed against the caller, never stored, so the same row reads differently to each
// person who can see it once sharing exists.
export const Attendee = z.object({
  email: z.string().nullable(),
  id: AttendeeId,
  isMe: z.boolean(),
  name: z.string().nullable(),
});
export type Attendee = z.infer<typeof Attendee>;

// The owner is not on the wire: a caller only ever sees their own notes, and `isMe` on the first
// attendee already says whose it is.
export const Note = z.object({
  // The owner first, then by stored position.
  attendees: z.array(Attendee),
  bodyMarkdown: NoteBody,
  createdAt: Timestamp,
  id: NoteId,
  source: NoteSource,
  startedAt: Timestamp,
  title: NoteTitle,
  trashedAt: Timestamp.nullable(),
  updatedAt: Timestamp,
});
export type Note = z.infer<typeof Note>;

// No body, so a page of a hundred rows stays small. The count includes the owner, which is why it
// is at least 1 and why a solo note's pill reads "+1".
export const NoteSummary = z.object({
  attendeeCount: z.number().int().min(1),
  id: NoteId,
  source: NoteSource,
  startedAt: Timestamp,
  title: NoteTitle,
});
export type NoteSummary = z.infer<typeof NoteSummary>;

// Somebody who is not a Notes user yet: a name, an address, or both. Linking one to an account is
// phase 8's, so there is no `userId` to send.
export const AttendeeInput = z
  .strictObject({
    email: z.email().max(254).optional(),
    name: z.string().trim().min(1).max(100).optional(),
  })
  .refine((input) => input.email !== undefined || input.name !== undefined, {
    message: "An attendee needs a name or an email",
  });
export type AttendeeInput = z.output<typeof AttendeeInput>;

// Strict, so a body naming an owner or a trash stamp is a 422 rather than a 200 that dropped it.
// Every field has a server default: the title "Untitled note", the body "", `startedAt` now.
export const NoteCreate = z.strictObject({
  // Besides the owner, who is always added at position 0.
  attendees: z.array(AttendeeInput).max(50).optional(),
  bodyMarkdown: NoteBody.optional(),
  startedAt: Timestamp.optional(),
  title: NoteTitle.optional(),
});
export type NoteCreate = z.output<typeof NoteCreate>;

// An absent key is untouched, and `{}` is a no-op. Trash and restore are their own routes, so
// `trashedAt` is not a field a patch can reach.
export const NotePatch = z.strictObject({
  bodyMarkdown: NoteBody.optional(),
  title: NoteTitle.optional(),
});
export type NotePatch = z.output<typeof NotePatch>;
