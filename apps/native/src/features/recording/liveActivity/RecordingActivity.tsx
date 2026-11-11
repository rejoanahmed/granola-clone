import { Button, HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  activityBackgroundTint,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  padding,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";
import type { RecordingActivityProps } from "./activityProps";

// The lock-screen banner and the Dynamic Island while a meeting records (D037). This function is
// not run by the app: the `'widget'` directive makes babel-preset-expo serialise its body into a
// string that the widget extension evaluates in its own JavaScript runtime. So it may reference
// nothing outside itself — not a constant above, not the palette, not the copy. Everything it
// draws arrives in `props`, built by `activityProps.ts`, which is also where the colours come from
// `@kn/tokens` (the tokens test forbids a hex literal here anyway).
//
// The timer is `Text(timerInterval:)`: the system advances it every second on its own, with no
// update from the app, which is the only way a lock-screen timer stays live while iOS throttles a
// backgrounded app's updates. Paused, `pauseTime` freezes it at the moment of the pause.
//
// The buttons are App Intents (`LiveActivityIntent`, iOS 17+), which iOS runs in the app's process;
// `liveActivity.ts` listens for their `target`s and drives the same store the live card does.
const RecordingActivity = (
  props: RecordingActivityProps,
  environment: LiveActivityEnvironment
) => {
  "widget";
  const live = props.state === "recording";
  const status = props.labels[props.state];
  const accent = environment.isLuminanceReduced
    ? props.colors.text
    : props.colors.accent;
  const glyph = live ? "waveform" : "pause.fill";
  const timerRange = {
    lower: new Date(props.anchorMs),
    upper: new Date(props.anchorMs + props.maxMs),
  };
  const pauseTime =
    props.pausedAtMs === null ? undefined : new Date(props.pausedAtMs);

  const timer = (size: number) => (
    <Text
      countsDown={false}
      modifiers={[
        font({ design: "rounded", size, weight: "semibold" }),
        monospacedDigit(),
        foregroundStyle(props.colors.text),
      ]}
      pauseTime={pauseTime}
      timerInterval={timerRange}
    />
  );

  const controls = (
    <HStack spacing={10}>
      <Button
        label={live ? props.labels.pause : props.labels.resume}
        modifiers={[buttonStyle("bordered"), tint(props.colors.text)]}
        systemImage={live ? "pause.fill" : "play.fill"}
        target={live ? "pause" : "resume"}
      />
      <Button
        label={props.labels.stop}
        modifiers={[buttonStyle("borderedProminent"), tint(props.colors.stop)]}
        systemImage="stop.fill"
        target="stop"
      />
    </HStack>
  );

  return {
    banner: (
      <VStack
        alignment="leading"
        modifiers={[
          padding({ all: 16 }),
          activityBackgroundTint(props.colors.background),
        ]}
        spacing={12}
      >
        <HStack alignment="center" spacing={12}>
          <Image color={accent} size={22} systemName={glyph} />
          <VStack alignment="leading" spacing={2}>
            <Text
              modifiers={[
                font({ size: 13, weight: "semibold" }),
                foregroundStyle(accent),
              ]}
            >
              {status}
            </Text>
            <Text
              modifiers={[
                font({ size: 16, weight: "semibold" }),
                foregroundStyle(props.colors.text),
                lineLimit(1),
              ]}
            >
              {props.title}
            </Text>
          </VStack>
          <Spacer />
          {timer(26)}
        </HStack>
        {controls}
      </VStack>
    ),
    compactLeading: <Image color={accent} size={14} systemName={glyph} />,
    compactTrailing: (
      <Text
        countsDown={false}
        modifiers={[
          font({ size: 14, weight: "semibold" }),
          monospacedDigit(),
          foregroundStyle(accent),
          frame({ maxWidth: 56 }),
        ]}
        pauseTime={pauseTime}
        timerInterval={timerRange}
      />
    ),
    expandedBottom: controls,
    expandedCenter: (
      <Text
        modifiers={[
          font({ size: 15, weight: "semibold" }),
          foregroundStyle(props.colors.text),
          lineLimit(1),
        ]}
      >
        {props.title}
      </Text>
    ),
    expandedLeading: (
      <HStack spacing={6}>
        <Image color={accent} size={16} systemName={glyph} />
        <Text
          modifiers={[
            font({ size: 13, weight: "semibold" }),
            foregroundStyle(accent),
          ]}
        >
          {status}
        </Text>
      </HStack>
    ),
    expandedTrailing: timer(20),
    minimal: <Image color={accent} size={14} systemName={glyph} />,
  };
};

export default createLiveActivity("RecordingActivity", RecordingActivity);
