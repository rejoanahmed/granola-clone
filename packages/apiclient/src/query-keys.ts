import type { QueryKey } from "./query";

// Keys are `[scope, resource, ...identity, ...refinement]` and TanStack matches by prefix, so a
// list's `"list"` segment must never collide with an id at that position — safe only while every
// id carries a type prefix. When a list key is added, derive its filter type from the client
// method rather than hand-writing it: a key describing a request the client cannot make is a
// silent miss.
export const queryKeys = {
  me: {
    all: ["me"] as const,
    profile: () => ["me", "profile"] as const,
  },
} as const;

export const queryDefaults = {
  staleTimeMs: 30_000,
} as const;

// What each mutation invalidates, so a screen never decides it alone. Empty until the first
// mutation exists; sign-out clears the whole cache rather than naming keys.
export const invalidationKeys = {} as const satisfies Record<
  string,
  (...ids: string[]) => readonly QueryKey[]
>;
