import { describe, expect, it } from "vitest";
import { E2E_SESSION_ARG, launchSessionCookie } from "./e2e-session";

const reading = (defaults: Record<string, unknown>) => (key: string) =>
  defaults[key];

describe("launchSessionCookie", () => {
  it("answers the Set-Cookie header the launch argument carries", () => {
    const header = "better-auth.session_token=tok.sig; Path=/; HttpOnly";
    expect(launchSessionCookie(reading({ [E2E_SESSION_ARG]: header }))).toBe(
      header
    );
  });

  // `launch-app.yaml` always passes the argument, empty unless a flow minted a session, so an
  // ordinary clean launch must read as "no session to adopt", not as a cookie named "".
  it("reads an absent, empty or non-string argument as no session", () => {
    expect(launchSessionCookie(reading({}))).toBeNull();
    expect(launchSessionCookie(reading({ [E2E_SESSION_ARG]: "" }))).toBeNull();
    expect(
      launchSessionCookie(reading({ [E2E_SESSION_ARG]: "  " }))
    ).toBeNull();
    expect(launchSessionCookie(reading({ [E2E_SESSION_ARG]: 1 }))).toBeNull();
  });
});
