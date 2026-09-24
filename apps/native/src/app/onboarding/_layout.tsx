import useThemedNavigation from "@native/hooks/useThemedNavigation";
import { Stack } from "expo-router";

// Step 1 has no Back, so its swipe-back is off too: the way out of it is "Not you? Sign out".
export default function OnboardingLayout() {
  const { screenOptions } = useThemedNavigation();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="name" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
