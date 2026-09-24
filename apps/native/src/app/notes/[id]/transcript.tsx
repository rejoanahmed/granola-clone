import {
  colors,
  ICON_STROKE,
  PillButton,
  PRESSED_OPACITY,
  radii,
  sizes,
  spacing,
  Text,
  useToast,
} from "@native/design";
import {
  TRANSCRIPT_COPY,
  transcriptShareText,
} from "@native/features/transcript/share";
import {
  speakerColor,
  speakerLabel,
} from "@native/features/transcript/speakers";
import {
  hasTag,
  noteQuery,
  type TranscriptDetail,
  transcriptQuery,
} from "@native/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { Share as ShareIcon, X } from "lucide-react-native";
import { useEffect } from "react";
import { Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// #13's measurements (428pt): the heading at 52 and 34pt serif, two 46pt buttons at the right,
// the avatar 44 at the gutter and the text column from x78; 24 between blocks.
const BUTTON = 46;
const AVATAR = 44;
const TEXT_LEFT = 78 - spacing.lg - AVATAR;
const BLOCK_GAP = 24;
const SKELETON_BLOCKS = 3;

const isGone = (error: unknown): boolean =>
  hasTag(error, "TranscriptNotFound") || hasTag(error, "NoteNotFound");

function RoundButton({
  icon: Icon,
  label,
  onPress,
  testID,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.round, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Icon
        color={colors.text.primary}
        size={sizes.glyph}
        strokeWidth={ICON_STROKE}
      />
    </Pressable>
  );
}

function Loading() {
  return (
    <View style={styles.blocks} testID="transcript-loading">
      {Array.from({ length: SKELETON_BLOCKS }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholder blocks have no identity.
        <View key={index} style={styles.block}>
          <View style={[styles.avatar, styles.skeleton]} />
          <View style={styles.column}>
            <View style={[styles.line, styles.lineShort]} />
            <View style={styles.line} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Utterances({ transcript }: { readonly transcript: TranscriptDetail }) {
  if (transcript.utterances.length === 0) {
    return (
      <Text style={styles.empty} testID="transcript-empty" variant="secondary">
        {TRANSCRIPT_COPY.empty}
      </Text>
    );
  }
  return (
    <View style={styles.blocks}>
      {transcript.utterances.map((utterance, index) => (
        <View
          key={`${utterance.startMs}-${index}`}
          style={styles.block}
          testID={`transcript-utterance-${index}`}
        >
          <View
            style={[
              styles.avatar,
              { backgroundColor: speakerColor(utterance.speaker) },
            ]}
          >
            <Text
              color={colors.text.onLight}
              style={styles.initial}
              testID={`transcript-avatar-${index}`}
              variant="title"
            >
              {utterance.speaker}
            </Text>
          </View>
          <View style={styles.column}>
            <Text testID={`transcript-speaker-${index}`} variant="title">
              {speakerLabel(utterance.speaker)}
            </Text>
            <Text
              color={colors.speaker.text}
              style={styles.text}
              testID={`transcript-text-${index}`}
              variant="body"
            >
              {utterance.text}
            </Text>
          </View>
        </View>
      ))}
      <View style={styles.end} testID="transcript-end" />
    </View>
  );
}

// The transcript sheet (#13, #14, #42; docs/spec/phase-5.md §3.10). The header stays put while the
// utterances scroll under it.
export default function TranscriptSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const query = useQuery(transcriptQuery(id));
  const note = useQuery(noteQuery(id));
  const gone = query.isError && isGone(query.error);

  const close = () => router.back();

  useEffect(() => {
    if (gone) {
      toast.show({ message: TRANSCRIPT_COPY.gone });
      router.back();
    }
  }, [gone, router, toast]);

  const share = () => {
    const transcript = query.data;
    if (!transcript) {
      return;
    }
    const title = note.data?.title ?? "";
    Share.share({
      message: transcriptShareText(title, transcript.utterances),
      title,
    }).catch(() => toast.show({ message: TRANSCRIPT_COPY.shareFailed }));
  };

  let body: React.ReactElement;
  if (query.data) {
    body = <Utterances transcript={query.data} />;
  } else if (query.isError && !gone) {
    body = (
      <View style={styles.state} testID="transcript-error">
        <Text style={styles.centred} variant="body">
          {TRANSCRIPT_COPY.error}
        </Text>
        <PillButton
          label={TRANSCRIPT_COPY.retry}
          onPress={() => query.refetch()}
          style={styles.retry}
          testID="transcript-retry"
          tone="light"
        />
      </View>
    );
  } else {
    body = <Loading />;
  }

  return (
    // The scroller is the screen's root: react-native-screens sizes a sheet's scroll view to the
    // sheet only when it is the content's first child, and moves it to the sheet's own origin
    // (off the bottom) when it is nested. The header is its sticky first row, so it stays pinned
    // while the utterances scroll under it (#14).
    <ScrollView
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      stickyHeaderIndices={[0]}
      style={styles.sheet}
      testID="transcript-sheet"
    >
      <View collapsable={false} style={styles.header}>
        <View style={styles.headings}>
          <Text
            accessibilityRole="header"
            testID="transcript-title"
            variant="displaySheet"
          >
            {TRANSCRIPT_COPY.title}
          </Text>
          <Text style={styles.subtitle} variant="secondary">
            {TRANSCRIPT_COPY.subtitle}
          </Text>
        </View>
        <View style={styles.buttons}>
          <RoundButton
            icon={ShareIcon}
            label={TRANSCRIPT_COPY.shareLabel}
            onPress={share}
            testID="transcript-share"
          />
          <RoundButton
            icon={X}
            label="Close"
            onPress={close}
            testID="transcript-close"
          />
        </View>
      </View>
      <View testID="transcript-scroll">{body}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    borderRadius: AVATAR / 2,
    height: AVATAR,
    justifyContent: "center",
    width: AVATAR,
  },
  block: { flexDirection: "row", gap: TEXT_LEFT },
  blocks: { gap: BLOCK_GAP, paddingHorizontal: spacing.lg },
  buttons: { flexDirection: "row", gap: spacing.xs },
  centred: { textAlign: "center" },
  column: { flex: 1, gap: spacing.xxs },
  empty: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
    textAlign: "center",
  },
  end: { height: sizes.hairline },
  header: {
    alignItems: "flex-start",
    backgroundColor: colors.bg.app,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    flexDirection: "row",
    gap: spacing.sm,
    left: 0,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    position: "absolute",
    right: 0,
    top: 0,
  },
  headings: { flex: 1 },
  initial: { fontSize: 20 },
  line: {
    backgroundColor: colors.bg.tileRaised,
    borderRadius: 6,
    height: 14,
  },
  lineShort: { width: 96 },
  pressed: { opacity: PRESSED_OPACITY },
  retry: { marginTop: spacing.md },
  round: {
    alignItems: "center",
    backgroundColor: colors.bg.app,
    borderColor: colors.border.hairline,
    borderRadius: BUTTON / 2,
    borderWidth: sizes.hairline,
    height: BUTTON,
    justifyContent: "center",
    width: BUTTON,
  },
  sheet: {
    backgroundColor: colors.bg.app,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    flex: 1,
  },
  skeleton: { backgroundColor: colors.bg.tileRaised },
  state: { alignItems: "center", paddingTop: spacing.xxl },
  subtitle: { marginTop: spacing.xs, maxWidth: 260 },
  text: { lineHeight: 24 },
});
