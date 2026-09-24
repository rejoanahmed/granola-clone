import { NoteId } from "@gc/domain/Domain/Note";
import { Timestamp } from "@gc/domain/Domain/Time";
import { z } from "zod";

// The keyset the list query seeks on: the last row of the page just served. `id` is compared, never
// looked up, so it needs the id's shape (checked on decode) and not its brand.
export type NotesPosition = { readonly id: string; readonly startedAt: number };

// A tuple rather than an object, so the cursor stays short enough to sit in a query string; exact
// in both slots, because a cursor that decodes to "roughly" a position is how a page gets skipped.
const Position = z.tuple([Timestamp, NoteId]);

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PADDING = /[=]+$/;

// `btoa`/`atob` rather than `Buffer`: this runs in the Worker. The payload is JSON over ASCII ids,
// so there is no multi-byte text for the Latin-1 codec to mangle.
const toBase64Url = (text: string): string =>
  btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(PADDING, "");

const fromBase64Url = (encoded: string): string | null => {
  if (!BASE64URL.test(encoded)) {
    return null;
  }
  try {
    return atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
  } catch {
    return null;
  }
};

export const encodeCursor = (position: NotesPosition): string =>
  toBase64Url(JSON.stringify([position.startedAt, position.id]));

// `null` for anything this module did not mint. The service turns that into a 422 on `cursor`;
// falling back to page one would loop a paging client forever with nothing in the logs.
export const decodeCursor = (cursor: string): NotesPosition | null => {
  const text = fromBase64Url(cursor);
  if (text === null) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = Position.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const [startedAt, id] = parsed.data;
  return { id, startedAt };
};
