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

// A tuple, as the notes cursor is, so it stays short in a query string; exact in every slot.
const Position = z.tuple([
  z.union([z.literal(0), z.literal(1)]),
  Timestamp,
  ChatThreadId,
]);

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PADDING = /[=]+$/;

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

export const encodeChatsCursor = (position: ChatsPosition): string =>
  toBase64Url(
    JSON.stringify([position.pinned, position.updatedAt, position.id])
  );

// `null` for anything this module did not mint, which the service answers as a 422 on `cursor`.
export const decodeChatsCursor = (cursor: string): ChatsPosition | null => {
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
  const [pinned, updatedAt, id] = parsed.data;
  return { id, pinned, updatedAt };
};
