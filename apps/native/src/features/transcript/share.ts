import { speakerLabel } from "./speakers";

type Utterance = { readonly speaker: string; readonly text: string };

export const TRANSCRIPT_COPY = {
  empty: "No speech was detected in this recording.",
  error: "Couldn’t load the transcript.",
  gone: "This transcript isn’t available",
  retry: "Retry",
  shareFailed: "Couldn’t share the transcript",
  shareLabel: "Share transcript",
  subtitle: "Review or share the full meeting transcript.",
  title: "Transcript",
} as const;

/** The note title, then one `Speaker A: …` paragraph per utterance, blank lines between. */
export const transcriptShareText = (
  title: string,
  utterances: readonly Utterance[]
): string =>
  [
    title.trim(),
    ...utterances.map(
      ({ speaker, text }) => `${speakerLabel(speaker)}: ${text.trim()}`
    ),
  ]
    .filter((paragraph) => paragraph !== "")
    .join("\n\n");
