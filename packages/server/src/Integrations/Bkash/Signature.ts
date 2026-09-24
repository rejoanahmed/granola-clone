/// <reference types="node" />
// `packages/server/tsconfig.json` fixes `types` to the Workers ones, so node builtins are
// referenced per-file. The Worker runs them under the `nodejs_compat` flag `apps/api` already sets.
import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

// HMAC-SHA256 over the RAW request bytes: the route must declare no `request.body`, or a validator
// calls `c.req.json()` first and every later `c.req.text()` is a re-serialised copy that fails.
// `node:crypto` rather than `crypto.subtle` because this function has to stay synchronous.

const HEX_PATTERN = /^[0-9a-f]+$/;

const ALGORITHM = "sha256";

/** Fails closed: a deployment that forgot `BKASH_WEBHOOK_SECRET` rejects every webhook. */
export const verifyBkashSignature = (
  rawBody: string,
  signature: string | null,
  secret: string
): boolean => {
  if (!signature || secret.length === 0) {
    return false;
  }

  const offered = signature.trim().toLowerCase();
  if (!HEX_PATTERN.test(offered)) {
    return false;
  }

  const expected = createHmac(ALGORITHM, secret)
    .update(rawBody, "utf8")
    .digest();
  const received = Buffer.from(offered, "hex");

  // `timingSafeEqual` throws on a length mismatch, so the lengths are compared first.
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
};
