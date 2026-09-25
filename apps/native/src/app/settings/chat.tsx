import { SettingsCard, SettingsRow } from "@native/design";
import { SETTINGS_COPY } from "@native/features/settings/copy";
import {
  SectionHeader,
  SettingsPage,
} from "@native/features/settings/SettingsPage";
import { SettingToggle } from "@native/features/settings/SettingToggle";
import { useSetting } from "@native/features/settings/useSetting";
import { Mic } from "lucide-react-native";

const COPY = SETTINGS_COPY.chat;

// #86: one switch, stored and read back; dictation itself is not built yet (BLOCKERS.md).
export default function ChatSettingsScreen() {
  const setting = useSetting("chatDictationAutoSend");
  return (
    <SettingsPage
      prefix="chat-settings"
      testID="chat-settings-screen"
      title={COPY.title}
    >
      <SectionHeader label={COPY.section} />
      <SettingsCard>
        <SettingsRow
          accessory={{
            kind: "control",
            node: (
              <SettingToggle
                accessibilityLabel={COPY.autoSend}
                state={setting}
                testID="chat-settings-auto-send"
              />
            ),
          }}
          icon={Mic}
          label={COPY.autoSend}
          onPress={setting.status === "ready" ? setting.toggle : undefined}
          subtitle={COPY.autoSendHint}
          testID="chat-settings-dictation-row"
        />
      </SettingsCard>
    </SettingsPage>
  );
}
