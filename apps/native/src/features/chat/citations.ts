// `[k]` markers in an answer's markdown become inline chips (docs/spec/phase-7.md §3.1). A marker
// whose `k` has no citation is dropped along with the space before it, so a model that numbers past
// its context leaves no dangling "[4]" and no double space.

export type Segment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "cite"; readonly index: number };

const MARKER = /[ \t]*\[(\d{1,3})\]/g;

export function segmentCitations(
  text: string,
  known: ReadonlySet<number>
): Segment[] {
  const segments: Segment[] = [];
  let pending = "";
  let last = 0;
  for (const match of text.matchAll(MARKER)) {
    const at = match.index ?? 0;
    pending += text.slice(last, at);
    last = at + match[0].length;
    const index = Number(match[1]);
    if (!known.has(index)) {
      continue;
    }
    if (pending !== "") {
      segments.push({ kind: "text", text: pending });
      pending = "";
    }
    segments.push({ index, kind: "cite" });
  }
  pending += text.slice(last);
  if (pending !== "") {
    segments.push({ kind: "text", text: pending });
  }
  return segments;
}

/** The markdown Copy puts on the clipboard: every marker gone, with the space before it. */
export const stripMarkers = (markdown: string): string =>
  markdown.replace(MARKER, "");
