import { ChatThreadId } from "@gc/domain/Domain/Chat";
import { Timestamp } from "@gc/domain/Domain/Time";
import { z } from "zod";

// The keyset the history list seeks on, the last row of the page just served: pinned first, then
// `updatedAt desc`, then `id desc`. `pinned` is 1 or 0 so the tuple compares the way it sorts.
export type ChatsPosition = {
  readonly id: string;
  readonly pinned: 0 | 1;
  readonly updatedAt: number;
};

// The search the page was served under travels with the position: a cursor is a place in one
// result set, and read under another `q` it would seek into rows it never counted.
export type ChatsCursor = ChatsPosition & { readonly q: string | null };

// A tuple, as the notes cursor is, so it stays short in a query string; exact in every slot.
const Position = z.tuple([
  z.union([z.literal(0), z.literal(1)]),
  Timestamp,
  ChatThreadId,
  z.string().nullable(),
]);

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PADDING = /[=]+$/;

// Through UTF-8 bytes, because `btoa` refuses anything outside Latin-1 and the search a cursor
// carries may be in any script.
const toBase64Url = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(PADDING, "");

const fromBase64Url = (encoded: string): string | null => {
  if (!BASE64URL.test(encoded)) {
    return null;
  }
  try {
    const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      Uint8Array.from(binary, (char) => char.charCodeAt(0))
    );
  } catch {
    return null;
  }
};

export const encodeChatsCursor = (cursor: ChatsCursor): string =>
  toBase64Url(
    JSON.stringify([cursor.pinned, cursor.updatedAt, cursor.id, cursor.q])
  );

// `null` for anything this module did not mint, which the service answers as a 422 on `cursor`.
export const decodeChatsCursor = (cursor: string): ChatsCursor | null => {
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
  const [pinned, updatedAt, id, q] = parsed.data;
  return { id, pinned, q, updatedAt };
};
