// Kept out of the route files: the components that link here need these shapes but must not import
// a route module — `routeTree.gen.ts` already imports them and the cycle is invisible until a hoist.

export type FeedSearch = {
  readonly city: string | null;
  readonly cursor: string | null;
};

export const ALL_EVENTS: FeedSearch = { city: null, cursor: null };

// Only ever a path, never an absolute URL — `login.tsx` enforces that; an absolute URL here turns
// sign-in into an open redirect.
export type LoginSearch = {
  readonly redirect: string | null;
};

export const NO_REDIRECT: LoginSearch = { redirect: null };
