import { useAuth } from "@native/lib/auth-provider";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Linking } from "react-native";
import { ownerLabelOf } from "./fromMeeting";
import { liveSessionId, startRecording } from "./liveRecording";
import type { MicCardKind } from "./MicCard";
import {
  makeNewRecordingFlow,
  type NewRecordingPorts,
} from "./newRecordingFlow";
import { readMicPermission, requestMicPermission } from "./permissions";

/** The + FAB and a meeting row's tap, over `makeNewRecordingFlow` (which holds the rules). */
export function useNewRecording() {
  const router = useRouter();
  const [card, setCard] = useState<MicCardKind | null>(null);
  const { session } = useAuth();
  const ownerName = ownerLabelOf(session?.user);

  const openLive = useCallback(
    (sessionId: string) =>
      router.push({ params: { id: sessionId }, pathname: "/record/[id]" }),
    [router]
  );

  const ports = useRef<NewRecordingPorts | null>(null);
  ports.current = {
    liveSessionId,
    openLive,
    openSettings: () => {
      Linking.openSettings().catch(() => undefined);
    },
    readPermission: readMicPermission,
    requestPermission: requestMicPermission,
    setCard,
    start: (event) => startRecording(event ? { event, ownerName } : undefined),
  };
  const [flow] = useState(() =>
    makeNewRecordingFlow(() => {
      if (!ports.current) {
        throw new Error("useNewRecording: ports read before the first render");
      }
      return ports.current;
    })
  );

  return {
    card,
    onClose: flow.onClose,
    onPress: flow.onPress,
    onPrimary: flow.onPrimary,
    openLive,
  };
}
