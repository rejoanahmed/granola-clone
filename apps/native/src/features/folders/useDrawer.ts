import { useCallback, useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  type SharedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

// #50: the drawer is 336/428 of the width (316pt on the 402pt app).
const WIDTH_FRACTION = 336 / 428;
const SLIDE_MS = 250;
// §3.1 Gestures: a release past 40% of the width, or a flick, settles the drawer that way.
const SETTLE_AT = 0.4;
const FLICK = 500;
const ACTIVATE_X = 10;
// §3.1: the edge pan begins only within 20pt of the left edge. A hit slop on the pan rather than a
// strip drawn over the list, so a tap, long-press or scroll starting there still reaches the row.
const EDGE_WIDTH = 20;
const FAIL_Y = 12;

export type Drawer = {
  readonly close: () => void;
  /** On home's content: a rightward pan from the left edge opens the drawer, tracking the finger. */
  readonly edgePan: ReturnType<typeof Gesture.Pan>;
  /** The drawer and its scrim: a leftward pan closes it. */
  readonly closePan: ReturnType<typeof Gesture.Pan>;
  /** Rendered: open, opening, closing or being dragged. */
  readonly mounted: boolean;
  readonly open: () => void;
  /** 0 closed, 1 open. The slide and the scrim's fade both read it. */
  readonly progress: SharedValue<number>;
  readonly width: number;
};

// `edgeEnabled` is false while the row menu or the mic card is up (§3.1).
export function useDrawer(edgeEnabled: boolean): Drawer {
  const { width: screen } = useWindowDimensions();
  const width = Math.round(screen * WIDTH_FRACTION);
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(false);
  // Only a pan that activated settles the drawer: one that failed was a tap (the scrim's close, a
  // row's pick), and settling it would race that tap's own open or close.
  const dragging = useSharedValue(false);

  const settle = useCallback(
    (to: 0 | 1) => {
      "worklet";
      progress.value = withTiming(to, { duration: SLIDE_MS }, (done) => {
        if (done && to === 0) {
          scheduleOnRN(setMounted, false);
        }
      });
    },
    [progress]
  );

  const open = useCallback(() => {
    setMounted(true);
    settle(1);
  }, [settle]);
  const close = useCallback(() => settle(0), [settle]);

  const edgePan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(edgeEnabled)
        .hitSlop({ left: 0, width: EDGE_WIDTH })
        .activeOffsetX(ACTIVATE_X)
        // Fails on a leftward drag, so a row the edge pan holds up can still swipe to trash.
        .failOffsetX(-ACTIVATE_X)
        .failOffsetY([-FAIL_Y, FAIL_Y])
        .onStart(() => {
          dragging.value = true;
          scheduleOnRN(setMounted, true);
        })
        .onUpdate((event) => {
          progress.value = Math.min(1, Math.max(0, event.translationX / width));
        })
        .onFinalize((event) => {
          if (!dragging.value) {
            return;
          }
          dragging.value = false;
          settle(progress.value > SETTLE_AT || event.velocityX > FLICK ? 1 : 0);
        }),
    [dragging, edgeEnabled, progress, settle, width]
  );

  const closePan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(-ACTIVATE_X)
        .failOffsetY([-FAIL_Y, FAIL_Y])
        .onStart(() => {
          dragging.value = true;
        })
        .onUpdate((event) => {
          progress.value = Math.min(
            1,
            Math.max(0, 1 + event.translationX / width)
          );
        })
        .onFinalize((event) => {
          if (!dragging.value) {
            return;
          }
          dragging.value = false;
          settle(
            1 - progress.value > SETTLE_AT || event.velocityX < -FLICK ? 0 : 1
          );
        }),
    [dragging, progress, settle, width]
  );

  return { close, closePan, edgePan, mounted, open, progress, width };
}
