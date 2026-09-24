import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "./Cursor";

// The cursor is opaque to clients and exact to the server: base64url of `[startedAt, id]`, the
// keyset the list query seeks on. Anything that does not decode to exactly that is `null`, which
// the service turns into a 422 — never a silent page one.

const AT = 1_700_000_000_000;
const ID = "not_0000000000000001";
const URL_SAFE = /^[A-Za-z0-9_-]+$/;

const b64 = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

describe("the notes cursor", () => {
  it("round-trips the keyset it was given", () => {
    const position = { id: ID, startedAt: AT };

    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it("is base64url of the [startedAt, id] tuple", () => {
    expect(decodeCursor(b64([AT, ID]))).toEqual({ id: ID, startedAt: AT });
  });

  it("encodes to URL-safe characters only, so it travels as a query string untouched", () => {
    expect(encodeCursor({ id: ID, startedAt: AT })).toMatch(URL_SAFE);
  });

  it.each([
    ["an empty string", ""],
    ["a single character", "x"],
    ["valid base64 of junk", Buffer.from("hello").toString("base64url")],
    ["an object instead of a tuple", b64({ id: ID, startedAt: AT })],
    ["a tuple of one", b64([AT])],
    ["a tuple of three", b64([AT, ID, 1])],
    ["the tuple reversed", b64([ID, AT])],
    ["a string timestamp", b64([String(AT), ID])],
    ["a fractional timestamp", b64([AT + 0.5, ID])],
    ["a negative timestamp", b64([-1, ID])],
    ["a numeric id", b64([AT, 42])],
    ["null", b64(null)],
  ])("decodes %s to null", (_what, cursor) => {
    expect(decodeCursor(cursor)).toBeNull();
  });
});
