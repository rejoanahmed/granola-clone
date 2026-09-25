import { CHAT_COPY } from "./copy";

/** The first whitespace-separated word of the profile name, or null when there is none. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first === "" ? null : first;
}

/** #70's serif greeting: "Hi <firstName>, ask anything", or "Ask anything" with no name. */
export function greetingFor(name: string | null | undefined): string {
  const first = firstNameOf(name);
  return first === null
    ? CHAT_COPY.greeting.fallback
    : CHAT_COPY.greeting.named(first);
}
