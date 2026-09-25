import type { ChatFeedback, ChatMessage } from "@gc/domain/Domain/Chat";
import {
  colors,
  PillButton,
  PRESSED_OPACITY,
  radii,
  spacing,
  Text,
} from "@native/design";
import { useRef } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { AnswerView } from "./AnswerView";
import { CHAT_COPY } from "./copy";

const CHIP_HEIGHT = 42;
const TURN_GAP = 32;
const HOLD_SCROLL_AT = 80;

/** State A (#19, #70): the serif greeting on global only, then the chip row above the composer. */
export function ChatEmpty({
  chips,
  greeting,
  onChip,
}: {
  readonly chips: readonly string[];
  readonly greeting: string | null;
  readonly onChip: (text: string) => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.greetingBox}>
        {greeting === null ? null : (
          <Text
            style={styles.greeting}
            testID="chat-greeting"
            variant="display"
          >
            {greeting}
          </Text>
        )}
      </View>
      <ScrollView
        contentContainerStyle={styles.chips}
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        testID="chat-chips"
      >
        {chips.map((chip, i) => (
          <Pressable
            accessibilityRole="button"
            key={chip}
            onPress={() => onChip(chip)}
            style={({ pressed }) => [
              styles.chip,
              pressed ? styles.pressed : null,
            ]}
            testID={`chat-chip-${i}`}
          >
            <Text variant="body">{chip}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

type ThreadProps = {
  readonly messages: readonly ChatMessage[];
  readonly onActivity: (message: ChatMessage) => void;
  readonly onCitation: (noteId: string) => void;
  readonly onFeedback: (messageId: string, value: ChatFeedback | null) => void;
  readonly onRetry: (messageId: string) => void;
};

/**
 * State B (#25). It follows the bottom as tokens arrive unless the reader has scrolled up more than
 * 80pt, where it stays put (designed).
 */
export function ChatThreadView({
  messages,
  onActivity,
  onCitation,
  onFeedback,
  onRetry,
}: ThreadProps) {
  const scroller = useRef<ScrollView>(null);
  const pinned = useRef(true);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const fromBottom =
      contentSize.height - contentOffset.y - layoutMeasurement.height;
    pinned.current = fromBottom <= HOLD_SCROLL_AT;
  };
  const turns = pairTurns(messages);
  return (
    <ScrollView
      contentContainerStyle={styles.thread}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={() => {
        if (pinned.current) {
          scroller.current?.scrollToEnd({ animated: false });
        }
      }}
      onScroll={onScroll}
      ref={scroller}
      scrollEventThrottle={32}
      testID="chat-thread"
    >
      {turns.map(({ answer, question }, n) => (
        <View
          key={question?.id ?? answer?.id}
          style={n > 0 ? styles.turnGap : null}
        >
          {question ? (
            <View style={styles.bubble}>
              <Text selectable testID={`chat-user-${n}`} variant="body">
                {question.content}
              </Text>
            </View>
          ) : null}
          {answer ? (
            <AnswerView
              message={answer}
              n={n}
              onActivity={() => onActivity(answer)}
              onCitation={onCitation}
              onFeedback={(value) => onFeedback(answer.id, value)}
              onRetry={() => onRetry(answer.id)}
            />
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

type Turn = { question: ChatMessage | null; answer: ChatMessage | null };

// Turn n is a question and the answer after it; a stray answer with no question still gets a turn.
export function pairTurns(messages: readonly ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    const last = turns.at(-1);
    if (message.role === "user") {
      turns.push({ answer: null, question: message });
    } else if (last && last.answer === null) {
      last.answer = message;
    } else {
      turns.push({ answer: message, question: null });
    }
  }
  return turns;
}

/** States C and D: the spinner, or the load failure with Retry (a 404 gets no Retry). */
export function ChatProblem({
  gone,
  onRetry,
}: {
  readonly gone: boolean;
  readonly onRetry: () => void;
}) {
  return (
    <View style={styles.problem} testID="chat-error">
      <Text style={styles.centred} variant="secondary">
        {gone ? CHAT_COPY.thread.gone : CHAT_COPY.thread.loadFailed}
      </Text>
      {gone ? null : (
        <PillButton
          label={CHAT_COPY.thread.retry}
          onPress={onRetry}
          testID="chat-error-retry"
          tone="sheet"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.bg.sheet,
    borderRadius: 22,
    marginBottom: spacing.xl,
    marginHorizontal: spacing.lg,
    maxWidth: "75%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  centred: { textAlign: "center" },
  chip: {
    backgroundColor: colors.bg.sheet,
    borderRadius: radii.pill,
    height: CHIP_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  // A horizontal scroller in a column otherwise grows to fill it and centres the chips in the gap.
  chipRow: { flexGrow: 0 },
  chips: { gap: spacing.xs, paddingHorizontal: spacing.md },
  empty: { flex: 1, paddingBottom: spacing.sm },
  greeting: { marginHorizontal: spacing.lg + 3 },
  greetingBox: { flex: 1, justifyContent: "center" },
  pressed: { opacity: PRESSED_OPACITY },
  problem: {
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  thread: { paddingBottom: spacing.sm, paddingTop: spacing.xl },
  turnGap: { marginTop: TURN_GAP },
});
