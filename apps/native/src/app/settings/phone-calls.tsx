import {
  colors,
  ICON_STROKE,
  OFFSETS,
  PillButton,
  sizes,
  spacing,
  Text,
  useToast,
} from "@native/design";
import { SETTINGS_COPY } from "@native/features/settings/copy";
import { SettingsPage } from "@native/features/settings/SettingsPage";
import {
  ArrowRight,
  AudioLines,
  FileText,
  type LucideIcon,
  Phone,
} from "lucide-react-native";
import { StyleSheet, View } from "react-native";

const COPY = SETTINGS_COPY.phone;
const RING = 64;
const RING_STROKE = 4;
const PHONE_GLYPH = 30;
const TILE = 40;
const ROW_HEIGHT = 76;

function Benefit({
  icon: Icon,
  label,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
}) {
  return (
    <View style={styles.benefit}>
      <View style={styles.tile}>
        <Icon
          color={colors.olive.glyph}
          size={sizes.sendGlyph}
          strokeWidth={ICON_STROKE}
        />
      </View>
      <Text style={styles.flex} variant="body">
        {label}
      </Text>
    </View>
  );
}

// #87. Phone-call recording is out of scope, so Get Started only says so.
export default function PhoneCallsScreen() {
  const toast = useToast();
  return (
    <SettingsPage
      contentStyle={styles.content}
      prefix="phone-calls"
      testID="phone-calls-screen"
      title={COPY.header}
    >
      <View style={styles.ring}>
        <Phone
          color={colors.accent.olive}
          fill={colors.accent.olive}
          size={PHONE_GLYPH}
          strokeWidth={ICON_STROKE}
        />
      </View>
      <Text
        style={styles.title}
        testID="phone-calls-title"
        variant="displaySheet"
      >
        {COPY.title}
      </Text>
      <View style={styles.card}>
        <Benefit icon={FileText} label={COPY.notes} />
        <View style={styles.divider} />
        <Benefit icon={AudioLines} label={COPY.track} />
      </View>
      <View style={styles.action}>
        <PillButton
          icon={ArrowRight}
          iconPosition="trailing"
          label={COPY.getStarted}
          onPress={() => toast.show({ message: COPY.soon })}
          size="lg"
          testID="phone-calls-get-started"
          tone="light"
        />
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  // In the centred column, 24pt under the card, as #87 draws it — not pinned to the screen's foot.
  action: {
    alignSelf: "stretch",
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
  },
  benefit: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: spacing.md,
  },
  card: {
    alignSelf: "stretch",
    backgroundColor: colors.bg.app,
    borderColor: colors.border.hairline,
    borderRadius: 28,
    borderWidth: sizes.hairline,
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
  },
  content: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: OFFSETS.phoneCallsCentreShift,
  },
  divider: { backgroundColor: colors.border.hairline, height: sizes.hairline },
  flex: { flex: 1 },
  ring: {
    alignItems: "center",
    borderColor: colors.olive.ring,
    borderRadius: RING / 2,
    borderWidth: RING_STROKE,
    height: RING,
    justifyContent: "center",
    width: RING,
  },
  tile: {
    alignItems: "center",
    backgroundColor: colors.accent.oliveDark,
    borderRadius: TILE / 2,
    height: TILE,
    justifyContent: "center",
    width: TILE,
  },
  title: { marginTop: spacing.xl, textAlign: "center" },
});
