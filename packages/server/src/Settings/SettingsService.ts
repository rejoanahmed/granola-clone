import {
  SETTINGS_DEFAULTS,
  type UserSettings,
  type UserSettingsPatch,
} from "@gc/domain/Domain/Settings";
import type { Actor } from "../Auth/Actor";
import type { Clock } from "../Runtime/Clock";
import { canEditSettings } from "./Policy";
import type { SettingsRepo } from "./SettingsRepo";

export type SettingsDeps = {
  readonly clock: Clock;
  readonly repo: SettingsRepo;
};

const hasChanges = (patch: UserSettingsPatch): boolean =>
  Object.values(patch).some((value) => value !== undefined);

export const makeSettingsService = (deps: SettingsDeps) => {
  // An absent row is the defaults. Reading never writes one: a read that inserts is a write on
  // every settings screen open, for a value the absence already states.
  const get = async (actor: Actor): Promise<UserSettings> =>
    (await deps.repo.byUser(actor.id)) ?? SETTINGS_DEFAULTS;

  return {
    get,

    // `{}` writes nothing: a no-op patch must neither create a row nor move `updatedAt`.
    update: async (
      actor: Actor,
      patch: UserSettingsPatch
    ): Promise<UserSettings> => {
      const userId = canEditSettings(actor.id, actor);
      if (!hasChanges(patch)) {
        return get(actor);
      }
      await deps.repo.upsert(
        userId,
        SETTINGS_DEFAULTS,
        patch,
        deps.clock.now()
      );
      return get(actor);
    },
  };
};

export type SettingsService = ReturnType<typeof makeSettingsService>;
