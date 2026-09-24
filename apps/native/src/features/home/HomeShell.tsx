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
import { useRouter } from "expo-router";
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
import { initialFor } from "./initial";

const EVENTS_LABEL = "No upcoming events, Sign up with your work email.";
// Off the spacing scale on purpose: these are #01's measured gaps (source.xml), not a rhythm.
const BAR_GAP = 12;
const TOOLBAR_GAP = 6;
const HEADER_BAND_BOTTOM = 40;

// #01 with most destinations still to come: each control renders, is labelled and gives press
// feedback, and none navigates until the phase that owns it — except the avatar, which opens
// Settings (phase 3, for Sign out). `name` is the session user's.
export function HomeShell({ name }: { readonly name?: string | null }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const initial = initialFor(name);

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
              onPress={() => router.push("/settings")}
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
    borderRadius: sizes.avatar / 2,
    height: sizes.avatar,
    justifyContent: "center",
    width: sizes.avatar,
  },
  bar: {
    alignItems: "center",
    flexDirection: "row",
    gap: BAR_GAP,
    left: spacing.xl,
    position: "absolute",
    right: spacing.xl,
  },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  cardLines: { flex: 1, gap: sizes.cardLineGap },
  header: {
    backgroundColor: colors.bg.app,
    paddingBottom: HEADER_BAND_BOTTOM,
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
  toolbarSide: { alignItems: "center", flexDirection: "row", gap: TOOLBAR_GAP },
  underline: { textDecorationLine: "underline" },
});
