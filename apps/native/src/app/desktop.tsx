import {
  colors,
  ICON_STROKE,
  PillButton,
  PRESSED_OPACITY,
  radii,
  spacing,
  Text,
  useToast,
} from "@native/design";
import { SETTINGS_COPY } from "@native/features/settings/copy";
import { DesktopHero } from "@native/features/settings/DesktopHero";
import { LINKS } from "@native/features/settings/links";
import { useDesktopReminder } from "@native/lib/api";
import { useRouter } from "expo-router";
import {
  CalendarDays,
  type LucideIcon,
  Share as ShareIcon,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COPY = SETTINGS_COPY.desktop;
const TILE_HEIGHT = 108;
const CIRCLE = 44;
const GLYPH = 20;

type TileProps = {
  readonly busy?: boolean;
  readonly disabled: boolean;
  readonly fill: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
};

function Tile({
  busy,
  disabled,
  fill,
  icon: Icon,
  label,
  onPress,
  testID,
}: TileProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <View style={[styles.circle, { backgroundColor: fill }]}>
        {busy ? (
          <ActivityIndicator color={colors.text.onLight} />
        ) : (
          <Icon
            color={colors.text.onLight}
            size={GLYPH}
            strokeWidth={ICON_STROKE}
          />
        )}
      </View>
      <Text variant="rowTitle">{label}</Text>
    </Pressable>
  );
}

// Get desktop (#51, #89), from home's pill and the settings banner. It makes no request until
// Remind me later, which emails the caller a link through the fake email port (designed).
export default function DesktopSheet() {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const remind = useDesktopReminder();
  const busy = remind.isPending;

  return (
    <View style={styles.sheet} testID="desktop-sheet">
      <DesktopHero />
      <Text style={styles.title} testID="desktop-title" variant="display">
        {COPY.title}
      </Text>
      <Text
        color={colors.text.secondary}
        style={styles.body}
        testID="desktop-body"
        variant="body"
      >
        {COPY.body}
      </Text>
      <View style={styles.tiles}>
        <Tile
          disabled={busy}
          fill={colors.tile.share}
          icon={ShareIcon}
          label={COPY.share}
          onPress={() => {
            Share.share({
              message: COPY.shareMessage,
              url: LINKS.desktop,
            }).catch(() => undefined);
          }}
          testID="desktop-share"
        />
        <Tile
          busy={busy}
          disabled={busy}
          fill={colors.tile.remind}
          icon={CalendarDays}
          label={COPY.remind}
          onPress={() =>
            remind.mutate(undefined, {
              onError: () => toast.show({ message: COPY.remindError }),
              onSuccess: () => {
                router.back();
                toast.show({ message: COPY.reminded });
              },
            })
          }
          testID="desktop-remind"
        />
      </View>
      <View
        style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
      >
        <PillButton
          label={COPY.done}
          onPress={() => router.back()}
          size="lg"
          style={styles.done}
          testID="desktop-done"
          tone="dark"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    marginHorizontal: spacing.xxl,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  circle: {
    alignItems: "center",
    borderRadius: CIRCLE / 2,
    height: CIRCLE,
    justifyContent: "center",
    width: CIRCLE,
  },
  done: { backgroundColor: colors.bg.list, borderWidth: 0 },
  footer: { marginTop: "auto", paddingHorizontal: spacing.xl },
  pressed: { opacity: PRESSED_OPACITY },
  sheet: {
    backgroundColor: colors.bg.sheetTall,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    flex: 1,
    overflow: "hidden",
  },
  tile: {
    alignItems: "center",
    backgroundColor: colors.bg.list,
    borderRadius: radii.card,
    flex: 1,
    gap: spacing.sm,
    height: TILE_HEIGHT,
    paddingTop: 18,
  },
  tiles: {
    flexDirection: "row",
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: 28,
  },
  title: { marginHorizontal: 40, marginTop: 44, textAlign: "center" },
});
