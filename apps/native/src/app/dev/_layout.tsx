import useThemedNavigation from "@native/hooks/useThemedNavigation";
import { Redirect, Stack } from "expo-router";

// `__DEV__`, not an env var: a Release build compiles this branch to the redirect, so no deep link
// can reach the gallery or the demo sheet in a shipped app.
export default function DevLayout() {
  const { screenOptions } = useThemedNavigation();
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen
        name="sheet"
        options={{
          contentStyle: { backgroundColor: "transparent" },
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1],
          sheetCornerRadius: 40,
          sheetGrabberVisible: false,
        }}
      />
    </Stack>
  );
}
