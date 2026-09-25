// A PATCH body's keys are all optional, and an absent key is `undefined` after parsing. A patch
// whose every key is absent writes nothing, which is how `{}` stays a no-op in every context.
export const hasChanges = (patch: Readonly<Record<string, unknown>>): boolean =>
  Object.values(patch).some((value) => value !== undefined);
