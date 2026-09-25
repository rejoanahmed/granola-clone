import {
  IconButton,
  sizes,
  spacing,
  Text,
  ToolbarCapsule,
} from "@native/design";
import { ChevronLeft, History, SquarePen, X } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { CHAT_COPY } from "./copy";
import { navSideWidth } from "./navLayout";

const TITLE_FADE_MS = 150;

type Props = {
  readonly hasMessages: boolean;
  readonly left: "close" | "back";
  readonly onHistory: () => void;
  readonly onLeft: () => void;
  readonly onNewChat: () => void;
  readonly title: string;
};

/** #19 / #25 / #70: x or Back, the centred title, then history alone or the New chat + history capsule. */
export function ChatNav({
  hasMessages,
  left,
  onHistory,
  onLeft,
  onNewChat,
  title,
}: Props) {
  const side = { width: navSideWidth(hasMessages) };
  return (
    <View style={styles.row}>
      <View style={side}>
        <IconButton
          accessibilityLabel={
            left === "close" ? CHAT_COPY.nav.close : CHAT_COPY.nav.back
          }
          icon={left === "close" ? X : ChevronLeft}
          onPress={onLeft}
          testID={left === "close" ? "chat-close" : "chat-back"}
        />
      </View>
      <Animated.View
        entering={FadeIn.duration(TITLE_FADE_MS)}
        key={title}
        style={styles.titleBox}
      >
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={styles.title}
          testID="chat-title"
          variant="title"
        >
          {title}
        </Text>
      </Animated.View>
      <View style={[side, styles.right]}>
        {hasMessages ? (
          <ToolbarCapsule>
            <IconButton
              accessibilityLabel={CHAT_COPY.nav.newChat}
              bare
              icon={SquarePen}
              onPress={onNewChat}
              testID="chat-new-button"
            />
            <IconButton
              accessibilityLabel={CHAT_COPY.nav.history}
              bare
              icon={History}
              onPress={onHistory}
              testID="chat-history-button"
            />
          </ToolbarCapsule>
        ) : (
          <IconButton
            accessibilityLabel={CHAT_COPY.nav.history}
            icon={History}
            onPress={onHistory}
            testID="chat-history-button"
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  right: { alignItems: "flex-end" },
  row: {
    alignItems: "center",
    flexDirection: "row",
    height: sizes.iconButton,
    paddingHorizontal: spacing.lg,
  },
  title: { textAlign: "center" },
  titleBox: { flex: 1, paddingHorizontal: spacing.xxs },
});
