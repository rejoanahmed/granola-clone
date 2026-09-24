import { useThemeColors } from "@native/hooks/useThemedNavigation";
import { NativeTabs } from "expo-router/unstable-native-tabs";

// Icons are named twice because `sf` (SF Symbol) and `md` (Material) share no catalogue names.
export default function TabsLayout() {
  const colors = useThemeColors();

  return (
    <NativeTabs
      iconColor={{ default: colors.muted, selected: colors.accent }}
      labelStyle={{
        default: { color: colors.muted },
        selected: { color: colors.accent },
      }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon md="event" sf="ticket" />
        <NativeTabs.Trigger.Label>Events</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="tickets">
        <NativeTabs.Trigger.Icon md="confirmation_number" sf="qrcode" />
        <NativeTabs.Trigger.Label>My tickets</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
