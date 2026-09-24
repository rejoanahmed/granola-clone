import {
  Card,
  colors,
  Fab,
  IconButton,
  IconTile,
  PillButton,
  sizes,
  spacing,
  Text,
  ToolbarCapsule,
} from "@native/design";
import {
  CalendarDays,
  Folder,
  Laptop,
  MessageCircle,
  Phone,
  Search,
} from "lucide-react-native";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

const EVENTS_LABEL = "No upcoming events, Sign up with your work email.";
const BAR_GAP = 12;

// #01 with every destination still to come: each control renders, is labelled and gives press
// feedback, and none navigates until the phase that owns it. `name` is the session user's, so the
// dev preview (no session) shows the fallback initial.
export function HomeShell({ name }: { readonly name?: string | null }) {
  const insets = useSafeAreaInsets();
  const initial = name?.trim().charAt(0).toUpperCase() || "N";

  return (
    <View style={styles.screen} testID="home-screen">
      <SafeAreaView edges={["top"]} style={styles.header}>
        <View style={styles.toolbar}>
          <View style={styles.toolbarSide}>
            <IconButton
              accessibilityLabel="Folders"
              icon={Folder}
              testID="home-folders-button"
            />
            <PillButton
              icon={Laptop}
              label="Get desktop"
              testID="home-get-desktop-button"
              tone="dark"
            />
          </View>
          <ToolbarCapsule>
            <IconButton
              accessibilityLabel="Phone"
              bare
              icon={Phone}
              testID="home-phone-button"
            />
            <IconButton
              accessibilityLabel="Search"
              bare
              icon={Search}
              testID="home-search-button"
            />
            <IconButton
              accessibilityLabel="Settings"
              bare
              testID="home-settings-button"
            >
              <View style={styles.avatar}>
                <Text testID="home-avatar-initial" variant="rowTitle">
                  {initial}
                </Text>
              </View>
            </IconButton>
          </ToolbarCapsule>
        </View>

        <Text
          accessibilityRole="header"
          style={styles.title}
          testID="home-title"
          variant="display"
        >
          My notes
        </Text>

        <Card
          accessibilityLabel={EVENTS_LABEL}
          pressable
          style={styles.card}
          testID="home-events-card"
        >
          <IconTile background={colors.bg.app} icon={CalendarDays} />
          <View style={styles.cardLines}>
            <Text variant="rowTitle">No upcoming events</Text>
            <Text variant="secondary">
              <Text style={styles.underline} variant="secondary">
                Sign up
              </Text>{" "}
              with your work email.
            </Text>
          </View>
        </Card>
      </SafeAreaView>

      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={{
          paddingBottom: sizes.askPill + spacing.md + insets.bottom,
        }}
        style={styles.list}
        testID="home-list"
      />

      <View
        pointerEvents="box-none"
        style={[styles.bar, { bottom: insets.bottom + BAR_GAP }]}
      >
        <PillButton
          accessibilityLabel="Chat with Notes"
          filledIcon
          icon={MessageCircle}
          label="Ask anything"
          style={styles.ask}
          testID="home-ask-button"
          tone="glass"
        />
        <Fab accessibilityLabel="New note" testID="home-new-note-button" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ask: { flex: 1 },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.bg.tileRaised,
    borderRadius: sizes.iconButton / 2,
    height: sizes.iconButton - spacing.xs,
    justifyContent: "center",
    width: sizes.iconButton - spacing.xs,
  },
  bar: {
    alignItems: "center",
    flexDirection: "row",
    gap: BAR_GAP,
    left: spacing.md,
    position: "absolute",
    right: spacing.md,
  },
  card: { marginHorizontal: spacing.md, marginTop: spacing.lg },
  cardLines: { flex: 1, gap: 2 },
  header: {
    backgroundColor: colors.bg.app,
    paddingBottom: 40,
  },
  list: { backgroundColor: colors.bg.list, flex: 1 },
  screen: { backgroundColor: colors.bg.list, flex: 1 },
  title: { marginTop: spacing.lg, paddingHorizontal: spacing.xl },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
  },
  toolbarSide: { alignItems: "center", flexDirection: "row", gap: 6 },
  underline: { textDecorationLine: "underline" },
});
