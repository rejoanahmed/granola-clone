import {
  colors,
  ICON_STROKE,
  PillButton,
  radii,
  sizes,
  spacing,
  Text,
} from "@native/design";
import { useSignOut } from "@native/features/auth/signOut";
import { TextButton } from "@native/features/auth/TextButton";
import { SETTINGS_COPY } from "@native/features/settings/copy";
import { workEmailBody } from "@native/features/settings/workEmail";
import { useAuth } from "@native/lib/auth-provider";
import { useRouter } from "expo-router";
import {
  CalendarDays,
  type LucideIcon,
  Mail,
  NotebookPen,
  Users,
} from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COPY = SETTINGS_COPY.workEmail;
const MARK = 42;
const TILE = 40;
const ROW_HEIGHT = 72;

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
          color={colors.text.primary}
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

// The work-email upsell (#04), from home's events card. Signing up under another address means
// signing out; Continue anyway only closes it (both designed, docs/spec/phase-10.md §3.11).
export default function WorkEmailSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();
  const { me } = useAuth();
  const email = me.profile?.email ?? "";

  return (
    <View style={styles.sheet} testID="work-email-sheet">
      <View style={styles.content}>
        <View accessibilityLabel="Notes" accessible testID="work-email-mark">
          <NotebookPen
            color={colors.text.primary}
            size={MARK}
            strokeWidth={ICON_STROKE}
          />
        </View>
        <Text style={styles.title} testID="work-email-title" variant="display">
          {COPY.title}
        </Text>
        <Text style={styles.body} testID="work-email-body" variant="body">
          {workEmailBody(email)}
        </Text>
        <View style={styles.benefits} testID="work-email-benefits">
          <Benefit icon={CalendarDays} label={COPY.connect} />
          <View style={styles.divider} />
          <Benefit icon={Users} label={COPY.share} />
        </View>
      </View>
      <View
        style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
      >
        <PillButton
          icon={Mail}
          label={COPY.signUp}
          onPress={() => {
            router.back();
            signOut();
          }}
          size="lg"
          testID="work-email-sign-up"
          tone="light"
        />
        <TextButton
          label={COPY.continue}
          onPress={() => router.back()}
          testID="work-email-continue"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  benefit: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: spacing.md,
  },
  benefits: {
    alignSelf: "stretch",
    backgroundColor: colors.bg.list,
    borderColor: colors.border.hairline,
    borderRadius: radii.card,
    borderWidth: sizes.hairline,
    marginHorizontal: spacing.md,
    marginTop: spacing.xxl,
  },
  body: { marginHorizontal: 28, marginTop: spacing.md, textAlign: "center" },
  content: { alignItems: "center", flex: 1, justifyContent: "center" },
  divider: { backgroundColor: colors.border.hairline, height: sizes.hairline },
  flex: { flex: 1 },
  footer: { gap: spacing.lg, paddingHorizontal: spacing.xl },
  sheet: {
    backgroundColor: colors.bg.sheetTall,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    flex: 1,
  },
  tile: {
    alignItems: "center",
    borderColor: colors.border.hairline,
    borderRadius: TILE / 2,
    borderWidth: sizes.hairline,
    height: TILE,
    justifyContent: "center",
    width: TILE,
  },
  title: { marginHorizontal: 40, marginTop: spacing.xl, textAlign: "center" },
});
