import type { ActivityStep } from "@kn/domain/Domain/Chat";
import { CHAT_COPY } from "./copy";

// The Activity sheet is a route, and a route takes strings. The steps it draws are whatever the
// answer on screen holds right now — possibly mid-stream, before any query has them — so the screen
// leaves them here on the way out rather than the sheet refetching a thread that may lag behind.
const handedOver = new Map<string, readonly ActivityStep[]>();

export const handOverActivity = (
  messageId: string,
  steps: readonly ActivityStep[]
) => {
  handedOver.set(messageId, steps);
};

export const takeActivity = (
  messageId: string
): readonly ActivityStep[] | undefined => handedOver.get(messageId);

export type ActivityPhase = "searching" | "loaded" | "searched";

/** The answer's activity row label (§3.1): running, found notes, or found nothing. */
export function activityPhase(steps: readonly ActivityStep[]): ActivityPhase {
  if (steps.length === 0) {
    return "searching";
  }
  const found = steps.some((s) => s.kind !== "done" && s.notes.length > 0);
  return found ? "loaded" : "searched";
}

export const activityLabel = (phase: ActivityPhase): string =>
  CHAT_COPY.activity[phase];

/** "Loaded notes, 2 tools: List meetings, Read meetings" (#25). */
export function activityA11y(steps: readonly ActivityStep[]): string {
  const label = activityLabel(activityPhase(steps));
  const tools = steps.flatMap((s) =>
    s.kind === "done" ? [] : [CHAT_COPY.activity.toolNames[s.kind]]
  );
  if (tools.length === 0) {
    return label;
  }
  const noun = tools.length === 1 ? "tool" : "tools";
  return `${label}, ${tools.length} ${noun}: ${tools.join(", ")}`;
}
