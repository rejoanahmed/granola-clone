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

// The folder this device is deleting. Home clears a current folder that vanished from
// `GET /folders`, and says so only when somebody else removed it (§3.2): a delete the caller made
// needs no toast. Marked before the request, so the answer cannot depend on whether the mutation's
// callbacks or home's refetch run first; one slot, because a delete is confirmed one at a time and
// a set would keep every id this runtime ever deleted.
let deleting: string | null = null;

export function markDeleting(id: string): void {
  deleting = id;
}

export function unmarkDeleting(id: string): void {
  if (deleting === id) {
    deleting = null;
  }
}

export function wasDeletedHere(id: string): boolean {
  if (deleting !== id) {
    return false;
  }
  deleting = null;
  return true;
}
