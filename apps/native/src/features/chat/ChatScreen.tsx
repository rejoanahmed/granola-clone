import {
  type ChatScopeInput,
  GLOBAL_CHIPS,
  SCOPED_CHIPS,
} from "@gc/domain/Domain/Chat";
import { colors, type Frame, spacing, useToast } from "@native/design";
import { hasTag } from "@native/lib/api";
import { useAuth } from "@native/lib/auth-provider";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { handOverActivity } from "./activity";
import { chatModelsQuery, chatThreadQuery, useSelectChatModel } from "./api";
import { ChatEmpty, ChatProblem, ChatThreadView } from "./ChatBody";
import { ChatNav } from "./ChatNav";
import { Composer } from "./Composer";
import { CHAT_COPY } from "./copy";
import { greetingFor } from "./greeting";
import { listenToHistory } from "./historyBus";
import { ModelMenu } from "./ModelMenu";
import { useChatStream } from "./useChatStream";

const MODAL_TOP = spacing.md;
const NAV_TOP = 3;
const MENU_GAP = 8;

type Props = {
  readonly presentation: "modal" | "push";
  readonly scope: ChatScopeInput;
  /** The note's title or the person's name (#19, #66); "" for global. */
  readonly scopeTitle: string;
  readonly thread?: string;
  readonly threadTitle?: string;
};

/** The one chat screen behind the three Ask routes (docs/spec/phase-7.md §3.1). */
export function ChatScreen({
  presentation,
  scope,
  scopeTitle,
  thread: threadParam,
  threadTitle,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const chat = useChatStream(scope);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<Frame | null>(null);
  const [opening, setOpening] = useState<{ id: string; title: string } | null>(
    threadParam ? { id: threadParam, title: threadTitle ?? "" } : null
  );
  const openQuery = useQuery({
    ...chatThreadQuery(opening?.id ?? ""),
    enabled: opening !== null,
    staleTime: 0,
  });
  const models = useQuery(chatModelsQuery());
  const selectModel = useSelectChatModel();
  const { load, reset } = chat;
  // Both presentations end at the screen's bottom edge, so the composer rides the keyboard's own
  // height: 12 above it when it is up (#70), the bottom safe area when it is down. KeyboardAvoidingView
  // measured the page sheet's frame against the window and left the composer under the keys.
  const keyboard = useReanimatedKeyboardAnimation();
  const restBottom = Math.max(insets.bottom, spacing.sm);
  const composerLift = useAnimatedStyle(() => ({
    paddingBottom: Math.max(restBottom, -keyboard.height.value + spacing.sm),
  }));

  useEffect(() => {
    if (
      opening &&
      openQuery.data?.id === opening.id &&
      openQuery.isFetchedAfterMount
    ) {
      load(openQuery.data);
      setOpening(null);
    }
  }, [load, opening, openQuery.data, openQuery.isFetchedAfterMount]);

  const currentId = chat.state.thread?.id ?? null;
  useEffect(
    () =>
      listenToHistory((event) => {
        if (event.kind === "open") {
          setOpening({ id: event.threadId, title: event.title });
        } else if (event.threadId === currentId) {
          reset();
        }
      }),
    [currentId, reset]
  );

  const messages = chat.state.messages;
  const answered = messages.some(
    (m) => m.role === "assistant" && m.status !== "streaming"
  );
  let title = scopeTitle;
  if (opening) {
    title = opening.title;
  } else if (chat.state.thread && answered) {
    title = chat.state.thread.title;
  }

  const send = (text: string) => {
    const content = text.trim();
    if (content === "" || chat.busy || opening) {
      return;
    }
    setDraft("");
    chat.send(content);
  };

  const selected = models.data?.selected ?? "auto";
  const modelLabel =
    models.data?.models.find((m) => m.id === selected)?.shortLabel ?? "Auto";
  const loadFailed = opening !== null && openQuery.isError;
  const gone = loadFailed && hasTag(openQuery.error, "ChatNotFound");

  let body: React.ReactNode;
  if (loadFailed) {
    body = <ChatProblem gone={gone} onRetry={() => openQuery.refetch()} />;
  } else if (opening) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.text.tertiary} testID="chat-loading" />
      </View>
    );
  } else if (messages.length === 0) {
    body = (
      <ChatEmpty
        chips={scope.kind === "global" ? GLOBAL_CHIPS : SCOPED_CHIPS}
        greeting={
          scope.kind === "global" ? greetingFor(me.profile?.name) : null
        }
        onChip={send}
      />
    );
  } else {
    body = (
      <ChatThreadView
        messages={messages}
        onActivity={(message) => {
          handOverActivity(message.id, message.activity);
          router.push(`/ask/activity/${message.id}`);
        }}
        onCitation={(noteId) => router.push(`/ask/citation/${noteId}`)}
        onFeedback={chat.setFeedback}
        onRetry={chat.retry}
      />
    );
  }

  const top = presentation === "modal" ? MODAL_TOP : insets.top + NAV_TOP;
  return (
    <View style={[styles.screen, { paddingTop: top }]} testID="chat-screen">
      <ChatNav
        hasMessages={messages.length > 0}
        left={presentation === "modal" ? "close" : "back"}
        onHistory={() => router.push("/ask/history")}
        onLeft={() => router.back()}
        onNewChat={() => {
          setOpening(null);
          reset();
        }}
        title={title}
      />
      <View style={styles.flex}>
        <View style={styles.flex}>{body}</View>
        {gone ? null : (
          <Animated.View style={composerLift}>
            <Composer
              autoFocus={threadParam === undefined}
              draft={draft}
              modelLabel={modelLabel}
              onAttach={() =>
                toast.show({ message: CHAT_COPY.toasts.attachments })
              }
              onChangeDraft={setDraft}
              onDictate={() =>
                toast.show({ message: CHAT_COPY.toasts.dictation })
              }
              onModelPress={setMenu}
              onSend={() => send(draft)}
              scope={scope.kind}
              sendDisabled={chat.busy || opening !== null}
            />
          </Animated.View>
        )}
      </View>
      <ModelMenu
        anchor={menu ? { align: "left", frame: menu, gap: MENU_GAP } : null}
        models={models.data?.models ?? []}
        onClose={() => setMenu(null)}
        onPick={(id) => {
          setMenu(null);
          selectModel.mutate(id);
        }}
        selected={selected}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  flex: { flex: 1 },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
});
