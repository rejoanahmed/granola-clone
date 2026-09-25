// docs/spec/phase-9.md §4: verbatim from COPY.md, or marked designed there.
export const FOLDERS_COPY = {
  added: (name: string) => `Added to “${name}”`,
  addedSuffix: ", added",
  addFailed: "Couldn’t add this note. Try again.",
  addSubmit: "Add to folder",
  close: "Close",
  create: "Create",
  createDrawer: "Create new folder",
  createFailed: "Couldn’t create this folder. Try again.",
  createFolder: "Create folder",
  deleteBody: (name: string) =>
    `“${name}” will be deleted. Its notes stay in My notes.`,
  deleteConfirm: "Delete folder",
  deleted: "Folder deleted",
  deleteFailed: "Couldn’t delete this folder. Try again.",
  deleteTitle: "Delete folder?",
  dismiss: "Dismiss folders",
  emptyBody: "Folders will appear here after they are synced.",
  emptyTitle: "No folders yet",
  folderEmptyBody: "Add a note from its Add to folder button.",
  folderEmptyTitle: "No notes in this folder",
  folderGone: "This folder no longer exists.",
  folderGoneBack: "Back to My notes",
  folderGoneToast: "That folder no longer exists.",
  hideKeyboard: "Hide keyboard",
  limitReached: "You’ve reached the limit of 100 folders.",
  loadFailed: "Couldn’t load your folders.",
  myNotes: "My notes",
  nameTaken: (name: string) => `You already have a folder called “${name}”.`,
  newTitle: "New folder",
  noResultsFor: (q: string) => `No results for “${q}”`,
  placeholder: "Folder name",
  removed: (name: string) => `Removed from “${name}”`,
  removeFailed: "Couldn’t remove this note. Try again.",
  removeFromFolder: "Remove from folder",
  retry: "Try again",
  searchPlaceholder: "Search folders",
  section: "Folders",
  undo: "Undo",
} as const;

/** The count caption on a drawer or sheet row: "No notes", "1 note", "<n> notes". */
export function formatNoteCount(n: number): string {
  if (n === 0) {
    return "No notes";
  }
  return n === 1 ? "1 note" : `${n} notes`;
}

/** A row's one accessibility label: "<name>, <count>", plus ", added" on the sheet. */
export function folderRowLabel(
  name: string,
  noteCount: number,
  added = false
): string {
  const label = `${name}, ${formatNoteCount(noteCount)}`;
  return added ? `${label}${FOLDERS_COPY.addedSuffix}` : label;
}
