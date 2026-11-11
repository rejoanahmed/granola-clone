import type { ChatFeedback, ChatMessage } from "@kn/domain/Domain/Chat";
import {
  colors,
  ICON_STROKE,
  PRESSED_OPACITY,
  spacing,
  Text,
  useToast,
} from "@native/design";
import { setStringAsync } from "expo-clipboard";
import type { LucideIcon } from "lucide-react-native";
import {
  CircleAlert,
  Clipboard,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { ActivityRow, ThinkingLine } from "./AnswerParts";
import { CitedMarkdown } from "./CitedMarkdown";
import { stripMarkers } from "./citations";
import { CHAT_COPY } from "./copy";

const ANSWER_LINE = 32;
const ACTION = 32;
const ACTION_GLYPH = 20;
const ALERT = 18;

type Props = {
  readonly message: ChatMessage;
  readonly n: number;
  readonly onActivity: () => void;
  readonly onCitation: (noteId: string) => void;
  readonly onFeedback: (value: ChatFeedback | null) => void;
  readonly onRetry: () => void;
};

function ActionButton({
  icon: Icon,
  label,
  onPress,
  selected,
  testID,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  readonly selected?: boolean;
  readonly testID: string;
}) {
  const tint = selected ? colors.text.primary : colors.text.tertiary;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Icon
        color={tint}
        fill={selected ? tint : "transparent"}
        size={ACTION_GLYPH}
        strokeWidth={ICON_STROKE}
      />
    </Pressable>
  );
}

/** One assistant turn (#25): activity row, the markdown with its chips, then the status or actions. */
export function AnswerView({
  message,
  n,
  onActivity,
  onCitation,
  onFeedback,
  onRetry,
}: Props) {
  const toast = useToast();
  const id = `chat-answer-${n}`;
  const toggle = (value: ChatFeedback) =>
    onFeedback(message.feedback === value ? null : value);

  const copy = () => {
    setStringAsync(stripMarkers(message.content))
      .then(() => toast.show({ message: CHAT_COPY.answer.copied }))
      .catch(() => undefined);
  };

  return (
    <View style={styles.answer} testID={id}>
      <ActivityRow
        onPress={onActivity}
        steps={message.activity}
        testID={`${id}-activity`}
      />
      {message.content === "" ? null : (
        <View style={styles.body} testID={`${id}-body`}>
          <CitedMarkdown
            blockPrefix={`${id}-block`}
            citations={message.citations}
            lineHeight={ANSWER_LINE}
            onCitation={onCitation}
            source={message.content}
            testIDPrefix={id}
          />
        </View>
      )}
      {message.status === "streaming" && message.content === "" ? (
        <ThinkingLine
          label={CHAT_COPY.answer.thinking}
          testID={`${id}-status`}
        />
      ) : null}
      {message.status === "failed" ? (
        <View style={styles.failed}>
          <CircleAlert
            color={colors.destructive}
            size={ALERT}
            strokeWidth={ICON_STROKE}
          />
          <Text testID={`${id}-status`} variant="body">
            {CHAT_COPY.answer.failed}
          </Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={spacing.xs}
            onPress={onRetry}
            testID={`${id}-retry`}
          >
            <Text style={styles.retry} variant="rowTitle">
              {CHAT_COPY.answer.retry}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {message.status === "complete" ? (
        <View style={styles.actions} testID={`${id}-actions`}>
          <ActionButton
            icon={Clipboard}
            label={CHAT_COPY.answer.copy}
            onPress={copy}
            testID={`${id}-copy`}
          />
          <ActionButton
            icon={ThumbsUp}
            label={CHAT_COPY.answer.up}
            onPress={() => toggle("up")}
            selected={message.feedback === "up"}
            testID={`${id}-up`}
          />
          <ActionButton
            icon={ThumbsDown}
            label={CHAT_COPY.answer.down}
            onPress={() => toggle("down")}
            selected={message.feedback === "down"}
            testID={`${id}-down`}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    height: ACTION,
    justifyContent: "center",
    width: ACTION,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.xxs + 2,
    marginLeft: -spacing.xxs - 2,
    marginTop: spacing.sm,
  },
  answer: { paddingHorizontal: spacing.lg + spacing.xs },
  body: { marginTop: spacing.xs },
  failed: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  pressed: { opacity: PRESSED_OPACITY },
  retry: { textDecorationLine: "underline" },
});
