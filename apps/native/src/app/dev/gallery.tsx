import {
  Card,
  colors,
  Fab,
  FormDivider,
  FormRow,
  IconButton,
  IconTile,
  ListRow,
  PillButton,
  radii,
  SendButton,
  sizes,
  spacing,
  Text,
  TextField,
  ToolbarCapsule,
  type TypeVariant,
  typography,
} from "@native/design";
import { useRouter } from "expo-router";
import {
  CalendarDays,
  Folder,
  Laptop,
  MessageCircle,
  Phone,
  Search,
  Settings,
  Smartphone,
} from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const TYPE_NAMES: Record<TypeVariant, string> = {
  askLabel: "Ask label",
  body: "Body",
  caption: "Caption",
  display: "Display",
  displaySheet: "Display sheet",
  pillLabel: "Pill label",
  rowTitle: "Row title",
  secondary: "Secondary",
  title: "Title",
};

// Every leaf of `colors`, flattened to its dotted token name, so a token added to tokens.ts shows
// up here without an edit.
const flatten = (node: object, prefix = ""): [string, string][] =>
  Object.entries(node).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : flatten(value as object, `${prefix}${key}.`)
  );

const SWATCHES = flatten(colors);

// Clears the home indicator with room to spare, so the last section scrolls fully into view.
const BOTTOM_CLEARANCE = 120;
// #82's grouped form card.
const FORM_RADIUS = 28;

function Section({
  children,
  testID,
  title,
}: {
  readonly children: ReactNode;
  readonly testID: string;
  readonly title: string;
}) {
  return (
    <View style={styles.section} testID={testID}>
      <Text variant="caption">{title}</Text>
      {children}
    </View>
  );
}

export default function GalleryScreen() {
  const router = useRouter();
  const [field, setField] = useState("");
  const [row, setRow] = useState("");
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        testID="gallery-screen"
      >
        <Text style={styles.title} variant="display">
          Gallery
        </Text>

        <Section testID="gallery-colors" title="Colours">
          {SWATCHES.map(([name, hex]) => (
            <View key={name} style={styles.swatchRow}>
              <View style={[styles.swatch, { backgroundColor: hex }]} />
              <Text variant="caption">
                {name} {hex}
              </Text>
            </View>
          ))}
        </Section>

        <Section testID="gallery-type" title="Type">
          {(Object.keys(typography) as TypeVariant[]).map((variant) => (
            <Text key={variant} variant={variant}>
              {TYPE_NAMES[variant]}
            </Text>
          ))}
        </Section>

        <Section testID="gallery-buttons" title="Buttons">
          <View style={styles.wrap}>
            <IconButton
              accessibilityLabel="Folders"
              icon={Folder}
              testID="gallery-icon-button"
            />
            <ToolbarCapsule>
              <IconButton
                accessibilityLabel="Phone"
                bare
                icon={Phone}
                testID="gallery-capsule-phone"
              />
              <IconButton
                accessibilityLabel="Search"
                bare
                icon={Search}
                testID="gallery-capsule-search"
              />
              <IconButton
                accessibilityLabel="Settings"
                bare
                icon={Settings}
                testID="gallery-capsule-settings"
              />
            </ToolbarCapsule>
            <PillButton
              icon={Laptop}
              label="Get desktop"
              testID="gallery-pill-dark"
              tone="dark"
            />
            <PillButton
              disabled
              label="Disabled"
              testID="gallery-pill-disabled"
              tone="dark"
            />
          </View>
          <PillButton
            label="Get Started"
            size="lg"
            testID="gallery-pill-light"
            tone="light"
          />
          <PillButton
            filledIcon
            icon={MessageCircle}
            label="Ask anything"
            testID="gallery-pill-glass"
            tone="glass"
          />
          <View style={styles.wrap}>
            <Fab accessibilityLabel="New note" testID="gallery-fab" />
            <SendButton state="idle" testID="gallery-send-idle" />
            <SendButton state="active" testID="gallery-send-active" />
          </View>
        </Section>

        <Section testID="gallery-surfaces" title="Surfaces">
          <IconTile icon={Smartphone} testID="gallery-icon-tile" />
          <Card
            accessibilityLabel="No upcoming events, Sign up with your work email."
            pressable
            testID="gallery-card"
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
          <View style={styles.list}>
            <Text variant="secondary">Sat 12 Sep</Text>
            <ListRow
              icon={Smartphone}
              subtitle="9:39 AM"
              testID="gallery-row-1"
              title="Preservation effort planning"
            />
            <ListRow
              icon={Smartphone}
              subtitle="2:39 PM"
              testID="gallery-row-2"
              title="Solo reflection thoughts"
            />
          </View>
          <TextField
            onChangeText={setField}
            placeholder="you@example.com"
            testID="gallery-text-field"
            value={field}
          />
          <View style={styles.form} testID="gallery-form-row">
            <FormRow
              label="Job Title"
              onChangeText={setRow}
              placeholder="Your job title"
              testID="gallery-form-row-input"
              value={row}
            />
            <FormDivider />
            <FormRow
              label="User Type"
              onPress={() => undefined}
              placeholder="Choose"
              testID="gallery-form-row-choice"
              valueLabel="Startup/Generalist"
            />
          </View>
        </Section>

        <Section testID="gallery-sheets" title="Sheets">
          <View style={styles.wrap}>
            <PillButton
              label="Open sheet"
              onPress={() => router.push("/dev/sheet")}
              testID="gallery-open-sheet"
              tone="dark"
            />
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cardLines: { flex: 1, gap: sizes.cardLineGap },
  content: { gap: spacing.xxl, paddingBottom: BOTTOM_CLEARANCE },
  form: {
    borderColor: colors.border.hairline,
    borderRadius: FORM_RADIUS,
    borderWidth: sizes.hairline,
    paddingVertical: spacing.xxs,
  },
  list: {
    backgroundColor: colors.bg.list,
    borderRadius: spacing.md,
    gap: spacing.sm,
    padding: spacing.md,
  },
  screen: { backgroundColor: colors.bg.app, flex: 1 },
  section: { gap: spacing.sm, paddingHorizontal: spacing.md },
  swatch: {
    borderColor: colors.border.hairline,
    borderRadius: radii.tile,
    borderWidth: sizes.hairline,
    height: sizes.listTile,
    width: sizes.listTile,
  },
  swatchRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  title: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  underline: { textDecorationLine: "underline" },
  wrap: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
