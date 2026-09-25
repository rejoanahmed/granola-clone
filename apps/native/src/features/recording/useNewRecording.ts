import type { UpcomingEvent } from "@native/lib/api";
import { useAuth } from "@native/lib/auth-provider";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Linking } from "react-native";
import { liveSessionId, startRecording } from "./liveRecording";
import type { MicCardKind } from "./MicCard";
import { readMicPermission, requestMicPermission } from "./permissions";

/**
 * What the + FAB does (docs/spec/phase-5.md §3.11): undetermined → the primer, denied → the denied
 * card, granted → the live card. A tap while the permission check is running is dropped, so a
 * double tap cannot start two recordings.
 *
 * A meeting row passes its event (docs/spec/phase-11.md §3.2). It is held across the primer, the
 * system alert and the denied card, so Allow starts the meeting's recording; closing forgets it.
 */
export function useNewRecording() {
  const router = useRouter();
  const [card, setCard] = useState<MicCardKind | null>(null);
  const checking = useRef(false);
  const pendingEvent = useRef<UpcomingEvent | null>(null);
  const { session } = useAuth();
  const ownerName = session?.user.name ?? "";

  const openLive = useCallback(
    (sessionId: string) =>
      router.push({ params: { id: sessionId }, pathname: "/record/[id]" }),
    [router]
  );

  const begin = useCallback(() => {
    const event = pendingEvent.current;
    pendingEvent.current = null;
    openLive(startRecording(event ? { event, ownerName } : undefined));
  }, [openLive, ownerName]);

  const onPress = useCallback(
    async (options?: { readonly event?: UpcomingEvent }) => {
      const live = liveSessionId();
      if (live) {
        openLive(live);
        return;
      }
      if (checking.current) {
        return;
      }
      checking.current = true;
      pendingEvent.current = options?.event ?? null;
      try {
        const permission = await readMicPermission();
        if (permission === "granted") {
          begin();
        } else {
          setCard(permission === "denied" ? "denied" : "primer");
        }
      } finally {
        checking.current = false;
      }
    },
    [begin, openLive]
  );

  const onPrimary = useCallback(async () => {
    if (card === "denied") {
      pendingEvent.current = null;
      setCard(null);
      Linking.openSettings().catch(() => undefined);
      return;
    }
    // The card goes as the system alert comes up; Allow opens the live card with no second tap.
    setCard(null);
    const permission = await requestMicPermission();
    if (permission === "granted") {
      begin();
    } else {
      setCard("denied");
    }
  }, [begin, card]);

  const onClose = useCallback(() => {
    pendingEvent.current = null;
    setCard(null);
  }, []);

  return { card, onClose, onPress, onPrimary, openLive };
}
