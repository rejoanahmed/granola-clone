import { colors } from "@native/design/tokens";
import { StatusBar } from "expo-status-bar";

// Must stay at module scope: a component declared during render is a new component type each time,
// so React would remount the status bar on every re-render of the root layout.
export function ThemedStatusBar() {
  return <StatusBar style="light" />;
}

// Dark only: the product has no light appearance, and `app.json` pins `userInterfaceStyle` so the
// system never asks for one.
const SCREEN_OPTIONS = {
  contentStyle: { backgroundColor: colors.bg.app },
  headerShown: false,
} as const;

export default function useThemedNavigation() {
  return { screenOptions: SCREEN_OPTIONS, ThemedStatusBar };
}
