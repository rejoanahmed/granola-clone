import { describe, expect, it } from "vitest";
import { welcomeErrorCopy } from "./errors";

// §7 case 29: mapped on `code` and `status`, never on `message` — better-auth's messages are prose
// that changes between versions, and the copy is phase-3.md §4's.

const INVALID = "That code didn’t work. Check it and try again.";
const EXPIRED = "That code has expired. Send a new one.";
const TOO_MANY_ATTEMPTS = "Too many attempts. Send a new code.";
const RATE_LIMITED = "Too many tries. Wait a minute and try again.";
const INVALID_EMAIL = "Enter a valid email address.";
const NETWORK =
  "Couldn’t reach Kothanote. Check your connection and try again.";
const ANYTHING_ELSE = "Something went wrong. Try again.";

describe("welcomeErrorCopy", () => {
  it.each([
    ["INVALID_OTP", 400, INVALID],
    ["OTP_EXPIRED", 400, EXPIRED],
    ["TOO_MANY_ATTEMPTS", 403, TOO_MANY_ATTEMPTS],
    ["INVALID_EMAIL", 400, INVALID_EMAIL],
  ])("maps %s to its line", (code, status, copy) => {
    expect(welcomeErrorCopy({ code, message: "ignored", status })).toBe(copy);
  });

  it("maps a 429 to the rate-limit line, whatever the code", () => {
    expect(welcomeErrorCopy({ status: 429 })).toBe(RATE_LIMITED);
    expect(welcomeErrorCopy({ code: "RATE_LIMITED", status: 429 })).toBe(
      RATE_LIMITED
    );
  });

  it("reads a failure with no status as the network", () => {
    expect(welcomeErrorCopy({ message: "Network request failed" })).toBe(
      NETWORK
    );
  });

  it("does not read the message, so a known phrase with an unknown code is still unknown", () => {
    expect(
      welcomeErrorCopy({
        code: "SOMETHING_NEW",
        message: "Invalid OTP",
        status: 400,
      })
    ).toBe(ANYTHING_ELSE);
    expect(welcomeErrorCopy({ status: 500 })).toBe(ANYTHING_ELSE);
  });
});
