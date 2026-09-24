import { colors } from "@native/design/tokens";
import { StatusBar } from "expo-status-bar";

export type ThemeColors = {
  readonly accent: string;
  readonly background: string;
  readonly border: string;
  readonly card: string;
  readonly danger: string;
  readonly muted: string;
  readonly onAccent: string;
  readonly success: string;
  readonly text: string;
};

// Dark only: the product has no light appearance, and `app.json` pins `userInterfaceStyle` so the
// system never asks for one.
const THEME: ThemeColors = {
  accent: colors.accent.lime,
  background: colors.bg.app,
  border: colors.border.hairline,
  card: colors.bg.list,
  danger: colors.destructive,
  muted: colors.text.secondary,
  onAccent: colors.text.onLight,
  success: colors.switch.on,
  text: colors.text.primary,
};

export function useThemeColors(): ThemeColors {
  return THEME;
}

// Must stay at module scope: a component declared during render is a new component type each time,
// so React would remount the status bar on every re-render of the root layout.
export function ThemedStatusBar() {
  return <StatusBar style="light" />;
}

const SCREEN_OPTIONS = {
  contentStyle: { backgroundColor: THEME.background },
  headerShown: false,
} as const;

export default function useThemedNavigation() {
  return {
    colors: THEME,
    isDark: true,
    screenOptions: SCREEN_OPTIONS,
    ThemedStatusBar,
  };
}
