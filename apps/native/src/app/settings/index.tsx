import Config from "@native/config";
import {
  colors,
  ICON_STROKE,
  PRESSED_OPACITY,
  radii,
  SettingsCard,
  SettingsRow,
  spacing,
  Text,
  useToast,
} from "@native/design";
import { useSignOut } from "@native/features/auth/signOut";
import { SETTINGS_COPY } from "@native/features/settings/copy";
import { DataSharingCard } from "@native/features/settings/DataSharingCard";
import { LINKS } from "@native/features/settings/links";
import {
  SectionHeader,
  SettingsPage,
} from "@native/features/settings/SettingsPage";
import { VERSION } from "@native/features/settings/version";
import { SERVER_URL } from "@native/lib/server";
import { type Href, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  Bell,
  BookText,
  ChevronRight,
  CreditCard,
  Gift,
  Laptop,
  LogOut,
  Mail,
  MessageCircle,
  Phone,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
  User,
  Watch,
} from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, Share, StyleSheet } from "react-native";

const BANNER_HEIGHT = 56;
const BANNER_GLYPH = 20;
// A fixed beat, so the tap reads as "checked" before the answer (docs/spec/phase-10.md §3.1).
const RECOVER_DELAY_MS = 600;
const ROWS = SETTINGS_COPY.rows;
const spinner = <ActivityIndicator color={colors.text.secondary} />;

// Hidden unless the build shows unfinished work (D027): each of these leads to a page that says
// "coming soon", controls nothing, or advertises something that does not exist.
const UNFINISHED = Config.SHOW_UNFINISHED;

// Every server serves the policy at /privacy (D029), so the copy shown is the one the user's own
// server runs; the fixed link is only for a build with no server.
const PRIVACY_URL =
  SERVER_URL === null ? LINKS.privacy : `${SERVER_URL}/privacy`;

// #80/#81. Back may have nothing behind it: `sanitizeReturnPath` allows `/settings`, so a sign-in
// can `replace` straight onto this screen, and then home is where Back goes (SettingsPage).
export default function SettingsScreen() {
  const router = useRouter();
  const toast = useToast();
  const signOut = useSignOut();
  const [signingOut, setSigningOut] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const go = (href: Href) => () => router.push(href);

  const recover = () => {
    if (recovering) {
      return;
    }
    setRecovering(true);
    setTimeout(() => {
      setRecovering(false);
      toast.show({ message: SETTINGS_COPY.recovered });
    }, RECOVER_DELAY_MS);
  };

  return (
    <SettingsPage
      prefix="settings"
      testID="settings-screen"
      title={SETTINGS_COPY.title}
    >
      {UNFINISHED ? (
        <Pressable
          accessibilityLabel={SETTINGS_COPY.banner}
          accessibilityRole="button"
          onPress={go("/desktop")}
          style={({ pressed }) => [
            styles.banner,
            pressed ? styles.pressed : null,
          ]}
          testID="settings-desktop-banner"
        >
          <Laptop
            color={colors.text.primary}
            size={BANNER_GLYPH}
            strokeWidth={ICON_STROKE}
          />
          <Text style={styles.flex} variant="body">
            {SETTINGS_COPY.banner}
          </Text>
          <ChevronRight
            color={colors.text.primary}
            size={16}
            strokeWidth={ICON_STROKE}
          />
        </Pressable>
      ) : null}

      <SectionHeader
        label={SETTINGS_COPY.sections.account}
        testID="settings-section-account"
      />
      <SettingsCard>
        <SettingsRow
          accessory={{ kind: "chevron" }}
          icon={User}
          label={ROWS.profile}
          onPress={go("/settings/profile")}
          testID="settings-profile"
        />
        {/* The only toggle on Notifications is upcoming meetings, which needs a calendar. */}
        {UNFINISHED ? (
          <SettingsRow
            accessory={{ kind: "chevron" }}
            icon={Bell}
            label={ROWS.notifications}
            onPress={go("/settings/notifications")}
            testID="settings-notifications"
          />
        ) : null}
        {UNFINISHED ? (
          <SettingsRow
            accessory={{
              kind: "badge",
              label: SETTINGS_COPY.comingSoon,
              testID: "settings-subscription-badge",
            }}
            disabled
            icon={CreditCard}
            label={ROWS.subscription}
            testID="settings-subscription"
          />
        ) : null}
      </SettingsCard>

      {/* Chat's one setting is dictation, and Phone calls and Watch are "coming soon" pages. */}
      {UNFINISHED ? (
        <>
          <SectionHeader
            label={SETTINGS_COPY.sections.features}
            testID="settings-section-features"
          />
          <SettingsCard>
            <SettingsRow
              accessory={{ kind: "chevron" }}
              icon={MessageCircle}
              label={ROWS.chat}
              onPress={go("/settings/chat")}
              testID="settings-chat"
            />
            <SettingsRow
              accessory={{ kind: "chevron" }}
              icon={Phone}
              label={ROWS.phoneCalls}
              onPress={go("/settings/phone-calls")}
              testID="settings-phone-calls"
            />
            <SettingsRow
              accessory={{ kind: "chevron" }}
              icon={Watch}
              label={ROWS.watch}
              onPress={go("/settings/watch")}
              testID="settings-watch"
            />
          </SettingsCard>
        </>
      ) : null}

      <SectionHeader
        label={SETTINGS_COPY.sections.support}
        testID="settings-section-support"
      />
      <SettingsCard>
        <SettingsRow
          accessory={{ kind: "chevron" }}
          icon={Mail}
          label={ROWS.feedback}
          onPress={go("/settings/feedback")}
          testID="settings-feedback"
        />
        <SettingsRow
          accessory={{ kind: "chevron" }}
          icon={TriangleAlert}
          label={ROWS.reportBug}
          onPress={go("/settings/report-bug")}
          testID="settings-report-bug"
        />
        <SettingsRow
          accessory={{ kind: "external" }}
          icon={BookText}
          label={ROWS.help}
          onPress={() => {
            WebBrowser.openBrowserAsync(LINKS.help).catch(() => undefined);
          }}
          testID="settings-help"
        />
        {/* The privacy policy is a row of its own once the data card it lived in is hidden. */}
        {UNFINISHED ? null : (
          <SettingsRow
            accessory={{ kind: "external" }}
            icon={ShieldCheck}
            label={SETTINGS_COPY.data.privacy}
            onPress={() => {
              WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => undefined);
            }}
            testID="settings-privacy"
          />
        )}
        {/* Sharing needs a store link, and "recover" only ever answered a canned toast. */}
        {UNFINISHED ? (
          <>
            <SettingsRow
              accessory={{ kind: "chevron" }}
              icon={Gift}
              label={ROWS.shareApp}
              onPress={() => {
                Share.share({ message: SETTINGS_COPY.shareApp }).catch(
                  () => undefined
                );
              }}
              testID="settings-share-app"
            />
            <SettingsRow
              accessory={{ kind: "none", node: recovering ? spinner : null }}
              icon={RotateCcw}
              label={ROWS.recover}
              onPress={recover}
              testID="settings-recover"
            />
          </>
        ) : null}
      </SettingsCard>

      {/* "Use my data to improve models" is untrue on a self-hosted server: nothing reaches the
          developer (D019), so there is nothing to opt out of. */}
      {UNFINISHED ? (
        <>
          <SectionHeader label={SETTINGS_COPY.sections.data} />
          <DataSharingCard />
        </>
      ) : null}

      <SettingsCard style={styles.signOutCard}>
        <SettingsRow
          accessory={{ kind: "none", node: signingOut ? spinner : null }}
          icon={LogOut}
          label={ROWS.signOut}
          onPress={() => {
            if (!signingOut) {
              setSigningOut(true);
              signOut();
            }
          }}
          testID="settings-sign-out"
        />
      </SettingsCard>

      <Text
        color={colors.text.tertiary}
        style={styles.version}
        testID="settings-version"
        variant="caption"
      >
        {VERSION}
      </Text>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: "center",
    backgroundColor: colors.accent.oliveDark,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: spacing.md,
    height: BANNER_HEIGHT,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  flex: { flex: 1 },
  pressed: { opacity: PRESSED_OPACITY },
  signOutCard: { marginTop: spacing.xl, paddingVertical: 6 },
  version: { marginTop: spacing.md, textAlign: "center" },
});
