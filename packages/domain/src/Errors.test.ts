import { describe, expect, it } from "vitest";
import { AppError, appError, Forbidden, isAppError } from "./Errors";
import { ProfileNotFound } from "./Profile/Errors";

// `on-error.ts` decides every status by asking these two questions, so they are the contract R7
// rests on: an error class that answered either wrongly would surface as a 500 with no warning.

describe("appError", () => {
  it("carries its tag and status on the instance and on the class", () => {
    const error = new ProfileNotFound({ id: "usr_1" });

    expect(error._tag).toBe("ProfileNotFound");
    expect(error.status).toBe(404);
    expect(ProfileNotFound.status).toBe(404);
    expect(error.details).toEqual({ id: "usr_1" });
  });

  it("is an AppError however many factories minted the base", () => {
    class Teapot extends appError("Teapot", 422) {}

    expect(new Teapot()).toBeInstanceOf(AppError);
    expect(isAppError(new Teapot())).toBe(true);
    expect(isAppError(new Forbidden())).toBe(true);
  });

  it("does not mistake a plain Error, or an object shaped like one, for a domain error", () => {
    expect(isAppError(new Error("boom"))).toBe(false);
    expect(isAppError({ _tag: "Forbidden", status: 403 })).toBe(false);
  });

  it("defaults the operator message to the tag and keeps the cause as an object", () => {
    const cause = new Error("underlying");
    const error = new Forbidden({}, undefined, { cause });

    expect(error.message).toBe("Forbidden");
    expect(error.cause).toBe(cause);
  });
});
