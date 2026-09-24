import * as NavigationBar from "expo-navigation-bar";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, useColorScheme } from "react-native";

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

const LIGHT: ThemeColors = {
  accent: "#d8265c",
  background: "#fbfbfc",
  border: "#e4e4e8",
  card: "#ffffff",
  danger: "#c0392b",
  muted: "#6b6b76",
  onAccent: "#ffffff",
  success: "#0f7b56",
  text: "#111114",
};

const DARK: ThemeColors = {
  accent: "#ff5d86",
  background: "#0b0b0c",
  border: "#26262b",
  card: "#151518",
  danger: "#ff6b5c",
  muted: "#9a9aa5",
  onAccent: "#1a0009",
  success: "#4ade9f",
  text: "#f4f4f6",
};

export function useThemeColors(): ThemeColors {
  return useColorScheme() === "dark" ? DARK : LIGHT;
}

// Must stay at module scope: a component declared during render is a new component type each time,
// so React would remount the status bar on every re-render of the root layout.
export function ThemedStatusBar() {
  const scheme = useColorScheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}

export default function useThemedNavigation() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const colors = useThemeColors();

  useEffect(() => {
    // `NavigationBar` is an Android system surface; the call does not exist on iOS.
    if (Platform.OS === "android") {
      NavigationBar.setStyle(isDark ? "light" : "dark");
    }
  }, [isDark]);

  return {
    colors,
    isDark,
    screenOptions: {
      contentStyle: { backgroundColor: colors.background },
      headerShown: false,
    },
    ThemedStatusBar,
  };
}
