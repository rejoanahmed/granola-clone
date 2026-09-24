import {
  colors,
  fonts,
  IconButton,
  PillButton,
  radii,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { AudioLines, MicOff, X } from "lucide-react-native";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MIC_COPY } from "./copy";

export type MicCardKind = "primer" | "denied";

// Discovery screen 100's measurements (428pt): an inset of 22, radius 40, a 40pt glyph over a
// serif heading, and a full-width 56pt light pill 24 above the card's bottom edge.
const CARD_INSET = 22;
const GLYPH = 40;
const TITLE_SIZE = 34;
const TITLE_LINE = 40;
const SLIDE_MS = 240;

const CONTENT = {
  denied: {
    body: MIC_COPY.deniedBody,
    icon: MicOff,
    prefix: "mic-denied",
    primary: MIC_COPY.openSettings,
    primaryId: "mic-denied-settings",
    title: MIC_COPY.deniedTitle,
  },
  primer: {
    body: null,
    icon: AudioLines,
    prefix: "mic-primer",
    primary: MIC_COPY.continue,
    primaryId: "mic-primer-continue",
    title: MIC_COPY.primerTitle,
  },
} as const;

/**
 * The mic primer (screen 100) and the denied card (designed), one component over one chrome: home stays
 * visible under a half-black scrim, the card rises from the bottom, and the scrim closes it as the
 * Close glyph does. Neither creates a note.
 */
export function MicCard({
  kind,
  onClose,
  onPrimary,
}: {
  readonly kind: MicCardKind | null;
  readonly onClose: () => void;
  readonly onPrimary: () => void;
}) {
  const insets = useSafeAreaInsets();
  const content = kind ? CONTENT[kind] : null;
  const Icon = content?.icon ?? AudioLines;
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={content !== null}
    >
      {content ? (
        <View style={styles.layer}>
          <Pressable
            accessibilityLabel={MIC_COPY.close}
            onPress={onClose}
            style={[StyleSheet.absoluteFill, styles.scrim]}
            testID={`${content.prefix}-scrim`}
          />
          <Animated.View
            entering={SlideInDown.duration(SLIDE_MS)}
            exiting={SlideOutDown.duration(SLIDE_MS)}
            style={[styles.card, { marginBottom: insets.bottom + spacing.xs }]}
            testID={`${content.prefix}-card`}
          >
            <View style={styles.closeRow}>
              <IconButton
                accessibilityLabel={MIC_COPY.close}
                bare
                icon={X}
                onPress={onClose}
                testID={`${content.prefix}-close`}
              />
            </View>
            <Icon
              color={colors.text.tertiary}
              size={GLYPH}
              strokeWidth={1.5}
              style={styles.glyph}
            />
            <Text
              accessibilityRole="header"
              style={styles.title}
              testID={`${content.prefix}-title`}
              variant="displaySheet"
            >
              {content.title}
            </Text>
            {content.body ? (
              <Text style={styles.body} variant="secondary">
                {content.body}
              </Text>
            ) : null}
            <PillButton
              label={content.primary}
              onPress={onPrimary}
              size="lg"
              style={styles.primary}
              testID={content.primaryId}
              tone="light"
            />
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: spacing.sm, textAlign: "center" },
  card: {
    backgroundColor: colors.bg.list,
    borderColor: colors.border.hairline,
    borderRadius: radii.sheet,
    borderWidth: sizes.hairline,
    marginHorizontal: CARD_INSET - 2,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  closeRow: { alignItems: "flex-end", marginRight: -spacing.sm },
  glyph: { alignSelf: "center" },
  layer: { flex: 1, justifyContent: "flex-end" },
  primary: { marginTop: spacing.xl },
  scrim: { backgroundColor: colors.recording.scrim },
  title: {
    fontFamily: fonts.serif,
    fontSize: TITLE_SIZE,
    lineHeight: TITLE_LINE,
    marginTop: spacing.lg,
    textAlign: "center",
  },
});
