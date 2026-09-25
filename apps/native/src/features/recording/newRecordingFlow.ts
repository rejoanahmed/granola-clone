import type { UpcomingEvent } from "@native/lib/api";
import type { MicCardKind } from "./MicCard";
import type { MicPermission } from "./permissions";

/** What the flow reaches outside itself; read on every call, so a hook can hand it fresh closures. */
export type NewRecordingPorts = {
  readonly liveSessionId: () => string | null;
  readonly openLive: (sessionId: string) => void;
  readonly openSettings: () => void;
  readonly readPermission: () => Promise<MicPermission>;
  readonly requestPermission: () => Promise<MicPermission>;
  readonly setCard: (card: MicCardKind | null) => void;
  /** Starts the recording, the meeting's when there is one, and answers its session id. */
  readonly start: (event: UpcomingEvent | null) => string;
};

/**
 * What the + FAB and a meeting row do (docs/spec/phase-5.md §3.11, phase-11.md §3.2), apart from
 * React so a unit test can drive it: undetermined → the primer, denied → the denied card, granted →
 * the live card. A tap while the permission check is running is dropped, so a double tap cannot
 * start two recordings. A meeting's event is held across the primer, the system alert and the
 * denied card, so Allow starts that meeting's recording; closing either card forgets it.
 */
export function makeNewRecordingFlow(ports: () => NewRecordingPorts) {
  let checking = false;
  let card: MicCardKind | null = null;
  let pendingEvent: UpcomingEvent | null = null;

  const show = (next: MicCardKind | null) => {
    card = next;
    ports().setCard(next);
  };

  const begin = () => {
    const event = pendingEvent;
    pendingEvent = null;
    const { openLive, start } = ports();
    openLive(start(event));
  };

  return {
    onClose: (): void => {
      pendingEvent = null;
      show(null);
    },

    onPress: async (options?: {
      readonly event?: UpcomingEvent;
    }): Promise<void> => {
      const live = ports().liveSessionId();
      if (live) {
        ports().openLive(live);
        return;
      }
      if (checking) {
        return;
      }
      checking = true;
      pendingEvent = options?.event ?? null;
      try {
        const permission = await ports().readPermission();
        if (permission === "granted") {
          begin();
        } else {
          show(permission === "denied" ? "denied" : "primer");
        }
      } finally {
        checking = false;
      }
    },

    onPrimary: async (): Promise<void> => {
      if (card === "denied") {
        pendingEvent = null;
        show(null);
        ports().openSettings();
        return;
      }
      // The card goes as the system alert comes up; Allow opens the live card with no second tap.
      show(null);
      const permission = await ports().requestPermission();
      if (permission === "granted") {
        begin();
      } else {
        show("denied");
      }
    },
  };
}

export type NewRecordingFlow = ReturnType<typeof makeNewRecordingFlow>;
