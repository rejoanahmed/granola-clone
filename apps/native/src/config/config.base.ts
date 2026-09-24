// Nothing secret belongs in `src/config/`: every value in the Expo bundle is readable from a
// downloaded `.ipa`. Tier-independent settings go here; the per-tier ones are `config.dev.ts` and
// `config.prod.ts`.
export type ConfigBaseProps = Record<never, never>;

const BaseConfig: ConfigBaseProps = {};

export default BaseConfig;
