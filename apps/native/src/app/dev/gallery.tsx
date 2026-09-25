import {
  ActionMenu,
  Card,
  colors,
  Fab,
  FormDivider,
  FormRow,
  type Frame,
  IconButton,
  IconTile,
  ListRow,
  MENU_SEPARATOR,
  PillButton,
  radii,
  SendButton,
  SettingsCard,
  SettingsRow,
  sizes,
  spacing,
  Text,
  TextField,
  Toast,
  Toggle,
  ToolbarCapsule,
  type TypeVariant,
  typography,
  useToast,
} from "@native/design";
import { CalendarGallery } from "@native/features/calendar/CalendarGallery";
import { useRouter } from "expo-router";
import {
  Bell,
  BookText,
  CalendarDays,
  Copy,
  CreditCard,
  Folder,
  Laptop,
  MessageCircle,
  NotebookPen,
  Phone,
  Search,
  Settings,
  Smartphone,
  Trash2,
} from "lucide-react-native";
import { type ReactNode, useRef, useState } from "react";
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
// Two columns of small tiles, so the palette takes one screen rather than four and every section
// below it is a few swipes away.
const SWATCH_SIZE = 32;

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
  const [green, setGreen] = useState(true);
  const [lime, setLime] = useState(false);
  const [menuFrame, setMenuFrame] = useState<Frame | null>(null);
  const menuButton = useRef<View>(null);
  const toast = useToast();
  const closeMenu = () => setMenuFrame(null);
  const [now] = useState(() => Date.now());
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
          <View style={styles.swatchGrid}>
            {SWATCHES.map(([name, hex]) => (
              <View key={name} style={styles.swatchCell}>
                <View style={[styles.swatch, { backgroundColor: hex }]} />
                <View style={styles.swatchLabel}>
                  <Text numberOfLines={1} variant="caption">
                    {name}
                  </Text>
                  <Text numberOfLines={1} variant="caption">
                    {hex}
                  </Text>
                </View>
              </View>
            ))}
          </View>
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
          <PillButton
            label="Delete folder"
            size="lg"
            testID="gallery-pill-destructive"
            tone="destructive"
          />
          <PillButton
            disabled
            disabledLook="solid"
            label="Add to folder"
            testID="gallery-pill-solid-disabled"
            tone="light"
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
        </Section>

        <Section testID="gallery-fields" title="Fields">
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

        <Section testID="gallery-action-menu" title="Menu">
          <View collapsable={false} ref={menuButton} style={styles.wrap}>
            <PillButton
              label="Open menu"
              onPress={() =>
                menuButton.current?.measureInWindow((x, y, width, height) =>
                  setMenuFrame({ height, width, x, y })
                )
              }
              testID="gallery-open-menu"
              tone="dark"
            />
          </View>
          <ActionMenu
            anchor={
              menuFrame ? { align: "left", frame: menuFrame, gap: 8 } : null
            }
            entries={[
              {
                icon: NotebookPen,
                label: "Edit notes",
                onPress: closeMenu,
                testID: "gallery-menu-edit",
              },
              {
                icon: Copy,
                label: "Copy notes",
                onPress: closeMenu,
                testID: "gallery-menu-copy",
              },
              MENU_SEPARATOR,
              {
                destructive: true,
                icon: Trash2,
                label: "Move to trash",
                onPress: closeMenu,
                testID: "gallery-menu-trash",
              },
            ]}
            onClose={closeMenu}
            testID="gallery-menu"
          />
        </Section>

        <Section testID="gallery-settings" title="Settings">
          <View style={styles.wrap}>
            <Toggle
              accessibilityLabel="Green"
              onValueChange={setGreen}
              testID="gallery-toggle-green"
              value={green}
            />
            <Toggle
              accessibilityLabel="Lime"
              onValueChange={setLime}
              testID="gallery-toggle-lime"
              tone="lime"
              value={lime}
            />
          </View>
          <SettingsCard style={styles.flushCard}>
            <SettingsRow
              accessory={{ kind: "chevron" }}
              icon={Bell}
              label="Chevron"
              onPress={() => undefined}
              testID="gallery-settings-chevron"
            />
            <SettingsRow
              accessory={{ kind: "external" }}
              icon={BookText}
              label="External"
              onPress={() => undefined}
              testID="gallery-settings-external"
            />
            <SettingsRow
              accessory={{
                kind: "badge",
                label: "Coming soon",
                testID: "gallery-settings-badge",
              }}
              disabled
              icon={CreditCard}
              label="Badge"
              testID="gallery-settings-disabled"
            />
            <SettingsRow
              accessory={{
                kind: "control",
                node: (
                  <Toggle
                    accessibilityLabel="Toggle row"
                    onValueChange={setGreen}
                    testID="gallery-settings-toggle"
                    value={green}
                  />
                ),
              }}
              icon={Phone}
              label="Toggle"
              onPress={() => setGreen((on) => !on)}
              testID="gallery-settings-toggle-row"
            />
          </SettingsCard>
        </Section>

        <Section testID="gallery-toast" title="Toast">
          <Toast
            action={{ label: "Undo", onPress: () => undefined }}
            message="Moved to trash"
            testID="gallery-toast-sample"
          />
          <View style={styles.wrap}>
            <PillButton
              label="Show toast"
              onPress={() =>
                toast.show({
                  action: { label: "Undo", onPress: () => undefined },
                  message: "Moved to trash",
                })
              }
              testID="gallery-show-toast"
              tone="dark"
            />
          </View>
        </Section>

        <Section testID="gallery-calendar" title="Events card">
          <CalendarGallery now={now} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  cardLines: { flex: 1, gap: sizes.cardLineGap },
  content: { gap: spacing.xxl, paddingBottom: BOTTOM_CLEARANCE },
  flushCard: { marginHorizontal: 0 },
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
    height: SWATCH_SIZE,
    width: SWATCH_SIZE,
  },
  swatchCell: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    width: "48%",
  },
  swatchGrid: {
    columnGap: "4%",
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.sm,
  },
  swatchLabel: { flex: 1 },
  title: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  underline: { textDecorationLine: "underline" },
  wrap: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
