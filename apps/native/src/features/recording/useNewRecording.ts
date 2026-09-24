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
 */
export function useNewRecording() {
  const router = useRouter();
  const [card, setCard] = useState<MicCardKind | null>(null);
  const checking = useRef(false);

  const openLive = useCallback(
    (sessionId: string) =>
      router.push({ params: { id: sessionId }, pathname: "/record/[id]" }),
    [router]
  );

  const begin = useCallback(() => openLive(startRecording()), [openLive]);

  const onPress = useCallback(async () => {
    const live = liveSessionId();
    if (live) {
      openLive(live);
      return;
    }
    if (checking.current) {
      return;
    }
    checking.current = true;
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
  }, [begin, openLive]);

  const onPrimary = useCallback(async () => {
    if (card === "denied") {
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

  const onClose = useCallback(() => setCard(null), []);

  return { card, onClose, onPress, onPrimary, openLive };
}
