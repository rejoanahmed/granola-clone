// The Maestro fast sign-in (docs/TESTING.md §8): a development build launched with
// `-gcE2eSession "<Set-Cookie>"` adopts a session the E2E harness minted (`POST /e2e/session/:role`)
// instead of typing an email and a code. Only the credential is shortcut. The cookie lands in the
// same SecureStore jar a real sign-in writes, the first `get-session` verifies it against the real
// session row, and the gate sends the account wherever its profile says. A cookie the server does
// not honour reads as signed out, exactly as a stale real one does.
//
// iOS puts `-key value` launch arguments in the NSUserDefaults argument domain for that launch only,
// and React Native's `Settings` reads that domain. So a later relaunch without the argument keeps
// whatever the jar holds, which is what a relaunch after a real sign-in does.
export const E2E_SESSION_ARG = "gcE2eSession";

/** The launch argument's Set-Cookie header, or null when this launch carries none. */
export function launchSessionCookie(
  read: (key: string) => unknown
): string | null {
  const value = read(E2E_SESSION_ARG);
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
