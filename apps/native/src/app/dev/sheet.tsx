import { colors, PillButton, SheetChrome, spacing, Text } from "@native/design";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

// #16's chrome with static content, so the presentation can be proved before any sheet has data.
export default function DevSheetScreen() {
  const router = useRouter();
  return (
    <SheetChrome
      closeTestID="sheet-demo-close"
      left={
        <PillButton label="Add" size="sm" testID="sheet-demo-add" tone="dark" />
      }
      onClose={() => router.back()}
      testID="sheet-demo"
      title="Attendees"
    >
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text color={colors.text.onLight} variant="rowTitle">
            E
          </Text>
        </View>
        <Text variant="body">E2E Person (me)</Text>
      </View>
      <View style={styles.divider} />
    </SheetChrome>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    backgroundColor: colors.speaker.avatar,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  divider: {
    backgroundColor: colors.border.hairline,
    height: 1,
    marginHorizontal: spacing.xl,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
