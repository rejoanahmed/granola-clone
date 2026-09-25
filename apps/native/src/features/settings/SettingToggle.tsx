import { colors, Toggle } from "@native/design";
import { ActivityIndicator } from "react-native";
import { TextButton } from "../auth/TextButton";
import { SETTINGS_COPY } from "./copy";
import type { SettingState } from "./useSetting";

type Props = {
  readonly accessibilityLabel: string;
  readonly state: SettingState;
  readonly testID: string;
};

// The toggle in its slot, or what stands in for it while the settings load or after they failed.
export function SettingToggle({ accessibilityLabel, state, testID }: Props) {
  if (state.status === "loading") {
    return (
      <ActivityIndicator
        color={colors.text.secondary}
        testID={`${testID}-loading`}
      />
    );
  }
  if (state.status === "error") {
    return (
      <TextButton
        label={SETTINGS_COPY.toggle.retry}
        onPress={state.retry}
        testID={`${testID}-retry`}
      />
    );
  }
  return (
    <Toggle
      accessibilityLabel={accessibilityLabel}
      disabled={state.saving}
      onValueChange={state.toggle}
      testID={testID}
      value={state.value}
    />
  );
}
