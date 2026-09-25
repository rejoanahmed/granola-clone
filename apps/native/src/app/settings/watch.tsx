import { colors, sizes, spacing, Text } from "@native/design";
import { SETTINGS_COPY } from "@native/features/settings/copy";
import { SettingsPage } from "@native/features/settings/SettingsPage";
import { StyleSheet, View } from "react-native";

const COPY = SETTINGS_COPY.watch;
const DISC = 96;
const FACE_WIDTH = 44;
const FACE_HEIGHT = 54;
const SCREEN_WIDTH = 36;
const SCREEN_HEIGHT = 40;

// #88. There is no Watch app, so the page is the same in every state.
export default function WatchScreen() {
  return (
    <SettingsPage prefix="watch" testID="watch-screen">
      <Text style={styles.title} testID="watch-title" variant="display">
        {COPY.title}
      </Text>
      <View accessible={false} style={styles.disc}>
        <View style={styles.face}>
          <View style={styles.screen}>
            <Text
              adjustsFontSizeToFit
              allowFontScaling={false}
              color={colors.text.onLight}
              minimumFontScale={0.8}
              numberOfLines={1}
              style={styles.time}
              variant="caption"
            >
              0:07:26
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.status} testID="watch-status" variant="body">
        {COPY.status}
      </Text>
      <Text color={colors.text.secondary} style={styles.center} variant="body">
        {COPY.pair}
      </Text>
      <View style={styles.info}>
        <Text
          color={colors.text.secondary}
          style={styles.center}
          testID="watch-info"
          variant="body"
        >
          {COPY.info}
        </Text>
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  center: { marginTop: 2, textAlign: "center" },
  disc: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: `${colors.bg.tileRaised}99`,
    borderRadius: DISC / 2,
    height: DISC,
    justifyContent: "center",
    marginTop: spacing.xl,
    width: DISC,
  },
  face: {
    alignItems: "center",
    backgroundColor: colors.bg.iconButton,
    borderColor: colors.border.hairline,
    borderRadius: 12,
    borderWidth: sizes.hairline,
    height: FACE_HEIGHT,
    justifyContent: "center",
    width: FACE_WIDTH,
  },
  info: {
    backgroundColor: colors.bg.app,
    borderColor: colors.border.hairline,
    borderRadius: 28,
    borderWidth: sizes.hairline,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
    padding: spacing.lg,
  },
  screen: {
    alignItems: "center",
    backgroundColor: colors.accent.lime,
    borderRadius: 8,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    width: SCREEN_WIDTH,
  },
  status: { marginTop: spacing.md, textAlign: "center" },
  // A drawing, not copy: it never scales with Dynamic Type, and it stays on one line (#88) — at 11pt
  // semibold the digits are a hair wider than the 36pt screen, so they tighten rather than wrap.
  time: {
    fontSize: 11,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    letterSpacing: -0.3,
    lineHeight: 13,
  },
  title: { marginTop: spacing.xl, textAlign: "center" },
});
