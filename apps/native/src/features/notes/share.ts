// One text for Share notes, the Share pill and Copy notes (docs/spec/phase-4.md §2.8): the title as
// a heading over the source, so pasting it anywhere that reads markdown looks like the note.
export const noteShareText = (note: {
  readonly bodyMarkdown: string;
  readonly title: string;
}): string => `# ${note.title.trim()}\n\n${note.bodyMarkdown.trim()}`.trim();

export const SHARE_COPY = {
  copyFailed: "Couldn’t copy the notes. Try again.",
  failed: "Couldn’t share this note. Try again.",
} as const;
