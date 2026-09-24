// Nothing secret belongs in `src/config/`: every value in the Expo bundle is readable from a
// downloaded `.ipa` or `.apk`.
export type ConfigBaseProps = {
  /**
   * Display copy only. Never use it to decide whether a hold is still good — the live answer is
   * `RegistrationDetail.holdExpiresInMs`, computed against the server's clock.
   */
  readonly holdMinutesHint: number;
};

const BaseConfig: ConfigBaseProps = {
  holdMinutesHint: 30,
};

export default BaseConfig;
