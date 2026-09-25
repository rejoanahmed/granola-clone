import type { Folder } from "@native/lib/api";

// The New folder sheet hands its result to whichever screen opened it (docs/spec/phase-9.md §3.3):
// the Add to folder sheet reads it on its next focus and selects the folder. One-shot, so a later
// focus of the sheet does not re-select a folder the caller has since cleared.
let created: Folder | null = null;

export function handCreated(folder: Folder): void {
  created = folder;
}

export function takeCreated(): Folder | null {
  const folder = created;
  created = null;
  return folder;
}

// Folders this device deleted. Home clears a current folder that vanished from `GET /folders`, and
// says so only when somebody else removed it (§3.2): a delete the caller made needs no toast.
const deletedHere = new Set<string>();

export function markDeleted(id: string): void {
  deletedHere.add(id);
}

export function wasDeletedHere(id: string): boolean {
  return deletedHere.delete(id);
}
