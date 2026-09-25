import {
  type ChatScopeKind,
  GLOBAL_PLACEHOLDERS,
  SCOPED_PLACEHOLDER,
} from "@gc/domain/Domain/Chat";

export const PLACEHOLDER_INTERVAL_MS = 4000;

/** The composer's placeholder at rotation step `tick` (§3.2): global rotates, a scoped chat never does. */
export function placeholderAt(scope: ChatScopeKind, tick: number): string {
  if (scope !== "global") {
    return SCOPED_PLACEHOLDER;
  }
  const count = GLOBAL_PLACEHOLDERS.length;
  const step = Math.max(0, Math.floor(tick));
  return GLOBAL_PLACEHOLDERS[step % count] ?? SCOPED_PLACEHOLDER;
}
