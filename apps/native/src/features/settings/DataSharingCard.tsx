import {
  colors,
  ICON_STROKE,
  radii,
  SettingsCard,
  spacing,
  Text,
} from "@native/design";
import * as WebBrowser from "expo-web-browser";
import { FileText } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { SETTINGS_COPY } from "./copy";
import { LINKS } from "./links";
import { SettingToggle } from "./SettingToggle";
import { useSetting } from "./useSetting";

const TILE = 32;
const TILE_GLYPH = 18;

function Link({
  label,
  testID,
  url,
}: {
  readonly label: string;
  readonly testID: string;
  readonly url: string;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      hitSlop={spacing.xxs}
      onPress={() => {
        WebBrowser.openBrowserAsync(url).catch(() => undefined);
      }}
      testID={testID}
    >
      <Text color={colors.text.link} variant="secondary">
        {label}
      </Text>
    </Pressable>
  );
}

// #81's Data & sharing card: the explanation, Learn more, then the Use my data row and its toggle.
export function DataSharingCard() {
  const setting = useSetting("useDataForTraining");
  const copy = SETTINGS_COPY.data;
  return (
    <SettingsCard style={styles.card} testID="settings-section-data">
      <Text variant="body">{copy.heading}</Text>
      <Text style={styles.body} variant="secondary">
        {copy.body}
      </Text>
      <Link
        label={copy.learnMore}
        testID="settings-data-learn-more"
        url={LINKS.learnMore}
      />
      <View style={styles.row}>
        <View style={styles.tile}>
          <FileText
            color={colors.text.primary}
            size={TILE_GLYPH}
            strokeWidth={ICON_STROKE}
          />
        </View>
        <View style={styles.labels}>
          <Text variant="body">{copy.toggle}</Text>
          <Link
            label={copy.privacy}
            testID="settings-data-privacy"
            url={LINKS.privacy}
          />
        </View>
        <SettingToggle
          accessibilityLabel={copy.toggle}
          state={setting}
          testID="settings-use-my-data"
        />
      </View>
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: spacing.md },
  card: { padding: spacing.lg },
  labels: { flex: 1 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  tile: {
    alignItems: "center",
    backgroundColor: colors.bg.tileRaised,
    borderRadius: radii.tile,
    height: TILE,
    justifyContent: "center",
    width: TILE,
  },
});
