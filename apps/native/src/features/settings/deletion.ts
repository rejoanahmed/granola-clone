import { SETTINGS_COPY } from "./copy";

// The delete sheet's body for a preview of `noteCount` live notes (docs/spec/phase-10.md §3.3).
export function deletionCopy(noteCount: number): string {
  if (noteCount === 0) {
    return SETTINGS_COPY.delete.none;
  }
  if (noteCount === 1) {
    return SETTINGS_COPY.delete.one;
  }
  return SETTINGS_COPY.delete.many(noteCount);
}
