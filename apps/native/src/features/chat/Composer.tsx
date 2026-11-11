import { CHAT_MESSAGE_MAX, type ChatScopeKind } from "@gc/domain/Domain/Chat";
import Config from "@native/config";
import {
  colors,
  type Frame,
  ICON_STROKE,
  PRESSED_OPACITY,
  radii,
  SendButton,
  spacing,
  Text,
  typography,
} from "@native/design";
import { ChevronDown, Paperclip } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { CHAT_COPY } from "./copy";
import { PLACEHOLDER_INTERVAL_MS, placeholderAt } from "./placeholder";

const CONTROL = 40;
const MAX_LINES = 5;
const INPUT_TOP = 12;
const INPUT_LEFT = 16;
const MAX_INPUT_HEIGHT = typography.body.lineHeight * MAX_LINES + INPUT_TOP;
const FADE_MS = 200;
const CHEVRON = 13;
const CLIP = 20;

type Props = {
  readonly autoFocus: boolean;
  readonly draft: string;
  readonly modelLabel: string;
  readonly onAttach: (frame: Frame) => void;
  readonly onChangeDraft: (text: string) => void;
  readonly onDictate: () => void;
  readonly onModelPress: (frame: Frame) => void;
  readonly onSend: () => void;
  readonly scope: ChatScopeKind;
  /** An answer is streaming or the thread is loading: the draft stays editable, Send does not. */
  readonly sendDisabled: boolean;
  /** An answer is streaming: Send stays the olive arrow, disabled, even with the draft cleared. */
  readonly streaming: boolean;
};

function useRotatingPlaceholder(scope: ChatScopeKind, paused: boolean) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (scope !== "global" || paused) {
      return;
    }
    const timer = setInterval(
      () => setTick((t) => t + 1),
      PLACEHOLDER_INTERVAL_MS
    );
    return () => clearInterval(timer);
  }, [scope, paused]);
  return placeholderAt(scope, tick);
}

/** #19–#21: the `bg.list` card, the growing input, then paperclip, model pill and mic/send. */
export function Composer({
  autoFocus,
  draft,
  modelLabel,
  onAttach,
  onChangeDraft,
  onDictate,
  onModelPress,
  onSend,
  scope,
  sendDisabled,
  streaming,
}: Props) {
  const pill = useRef<View>(null);
  const clip = useRef<View>(null);
  const hasDraft = draft.trim() !== "";
  const placeholder = useRotatingPlaceholder(scope, hasDraft);

  const submit = () => {
    if (hasDraft && !sendDisabled) {
      onSend();
    }
  };

  return (
    <View style={styles.card} testID="chat-input-bar">
      <View>
        {draft === "" ? (
          <Animated.View
            entering={FadeIn.duration(FADE_MS)}
            exiting={FadeOut.duration(FADE_MS)}
            key={placeholder}
            pointerEvents="none"
            style={styles.placeholder}
          >
            <Text color={colors.text.tertiary} numberOfLines={1} variant="body">
              {placeholder}
            </Text>
          </Animated.View>
        ) : null}
        <TextInput
          accessibilityLabel={placeholder}
          autoFocus={autoFocus}
          cursorColor={colors.accent.lime}
          maxLength={CHAT_MESSAGE_MAX}
          multiline
          onChangeText={onChangeDraft}
          onSubmitEditing={submit}
          returnKeyType="send"
          selectionColor={colors.accent.lime}
          style={styles.input}
          submitBehavior="submit"
          testID="chat-input"
          value={draft}
        />
      </View>
      <View style={styles.controls}>
        {/* Both attachment kinds are "Coming soon" (D027): the paperclip is hidden and its room
            kept, so the model picker stays where it was. */}
        {Config.SHOW_UNFINISHED ? (
          <Pressable
            accessibilityLabel={CHAT_COPY.composer.attach}
            accessibilityRole="button"
            onPress={() =>
              clip.current?.measureInWindow((x, y, width, height) =>
                onAttach({ height, width, x, y })
              )
            }
            ref={clip}
            style={({ pressed }) => [
              styles.clip,
              pressed ? styles.pressed : null,
            ]}
            testID="chat-attach"
          >
            <Paperclip
              color={colors.text.secondary}
              size={CLIP}
              strokeWidth={ICON_STROKE}
            />
          </Pressable>
        ) : (
          <View style={styles.clip} />
        )}
        <Pressable
          accessibilityLabel={CHAT_COPY.composer.model(modelLabel)}
          accessibilityRole="button"
          onPress={() =>
            pill.current?.measureInWindow((x, y, width, height) =>
              onModelPress({ height, width, x, y })
            )
          }
          ref={pill}
          style={({ pressed }) => [
            styles.model,
            pressed ? styles.pressed : null,
          ]}
          testID="chat-model-button"
        >
          <Text testID="chat-model-label" variant="body">
            {modelLabel}
          </Text>
          <ChevronDown
            color={colors.text.primary}
            size={CHEVRON}
            strokeWidth={ICON_STROKE}
          />
        </Pressable>
        <View style={styles.spacer} />
        {/* Without dictation (D027) an empty composer shows Send, inert, rather than a mic whose
            only answer is "Dictation isn't available yet". */}
        <SendButton
          disabled={sendDisabled || !(hasDraft || Config.SHOW_UNFINISHED)}
          onPress={hasDraft ? submit : onDictate}
          size={CONTROL}
          state={
            hasDraft || streaming || !Config.SHOW_UNFINISHED ? "active" : "idle"
          }
          testID="chat-send"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.list,
    borderRadius: 28,
    marginHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  clip: {
    alignItems: "center",
    backgroundColor: colors.bg.app,
    borderRadius: radii.pill,
    height: CONTROL,
    justifyContent: "center",
    width: CONTROL,
  },
  controls: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xxs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  input: {
    ...typography.body,
    maxHeight: MAX_INPUT_HEIGHT,
    paddingLeft: INPUT_LEFT,
    paddingRight: spacing.md,
    paddingTop: INPUT_TOP,
  },
  model: {
    alignItems: "center",
    backgroundColor: colors.bg.app,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: spacing.xs,
    height: CONTROL,
    paddingHorizontal: spacing.md,
  },
  placeholder: {
    left: INPUT_LEFT,
    position: "absolute",
    right: 0,
    top: INPUT_TOP,
  },
  pressed: { opacity: PRESSED_OPACITY },
  spacer: { flex: 1 },
});
