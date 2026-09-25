// The Chat History sheet is its own route over whichever chat screen opened it, and a tapped row
// must load into that screen, keeping its presentation (§3.5): a modal stays a modal, a push stays a
// push. Routing to the chat with `?thread=` would push a second chat screen instead, so the sheet
// hands the choice to the chat screen underneath it, which is the most recently mounted one.

export type HistoryEvent =
  | { readonly kind: "open"; readonly threadId: string; readonly title: string }
  | { readonly kind: "deleted"; readonly threadId: string };

type Listener = (event: HistoryEvent) => void;

const listeners: Listener[] = [];

export function listenToHistory(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const at = listeners.lastIndexOf(listener);
    if (at !== -1) {
      listeners.splice(at, 1);
    }
  };
}

export function emitHistory(event: HistoryEvent) {
  if (event.kind === "deleted") {
    for (const listener of [...listeners]) {
      listener(event);
    }
    return;
  }
  listeners.at(-1)?.(event);
}
