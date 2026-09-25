import { colors, ICON_STROKE, spacing, Text } from "@native/design";
import { SETTINGS_COPY } from "@native/features/settings/copy";
import { SettingsPage } from "@native/features/settings/SettingsPage";
import { SettingToggle } from "@native/features/settings/SettingToggle";
import { useSetting } from "@native/features/settings/useSetting";
import { Clock, NotebookPen } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

const COPY = SETTINGS_COPY.notifications;
const BAR_HEIGHT = 44;
const BUTTON_HEIGHT = 44;
const MARK = 22;
const CLOCK = 15;

// #85's lock-screen mock. Static: it shows what the notification would look like, and nothing more.
function Preview() {
  return (
    <View
      accessibilityLabel="Notification preview"
      accessible
      style={styles.preview}
      testID="notifications-preview"
    >
      <View style={styles.event}>
        <View style={styles.bar} />
        <View style={styles.eventLines}>
          <Text variant="rowTitle">{COPY.previewTitle}</Text>
          <View style={styles.time}>
            <Clock
              color={colors.text.primary}
              size={CLOCK}
              strokeWidth={ICON_STROKE}
            />
            <Text color={colors.text.primary} variant="caption">
              {COPY.previewTime}
            </Text>
          </View>
        </View>
      </View>
      <View style={styles.start}>
        <NotebookPen
          color={colors.text.primary}
          size={MARK}
          strokeWidth={ICON_STROKE}
        />
        <Text variant="rowTitle">{COPY.start}</Text>
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const setting = useSetting("notifyUpcomingMeetings");
  return (
    <SettingsPage
      prefix="notifications"
      testID="notifications-screen"
      title={COPY.title}
    >
      <View style={styles.row} testID="notifications-upcoming-row">
        <View style={styles.rowLines}>
          <Text variant="body">{COPY.upcoming}</Text>
          <Text color={colors.text.secondary} variant="body">
            {COPY.hint}
          </Text>
        </View>
        <SettingToggle
          accessibilityLabel={COPY.upcoming}
          state={setting}
          testID="notifications-upcoming-toggle"
        />
      </View>
      <Preview />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.calendar.bar,
    borderRadius: 2,
    height: BAR_HEIGHT,
    width: 4,
  },
  event: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  eventLines: { flex: 1, gap: 6 },
  preview: {
    backgroundColor: colors.bg.preview,
    borderRadius: 24,
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    padding: spacing.md,
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  rowLines: { flex: 1, gap: spacing.xxs },
  start: {
    alignItems: "center",
    backgroundColor: colors.bg.app,
    borderRadius: 14,
    flexDirection: "row",
    gap: spacing.xs,
    height: BUTTON_HEIGHT,
    justifyContent: "center",
  },
  time: { alignItems: "center", flexDirection: "row", gap: spacing.xxs },
});
