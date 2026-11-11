import { hasChanges } from "@kn/domain/Domain/Patch";
import {
  SETTINGS_DEFAULTS,
  type UserSettings,
  type UserSettingsPatch,
} from "@kn/domain/Domain/Settings";
import { ProfileNotFound } from "@kn/domain/Profile/Errors";
import type { Actor } from "../Auth/Actor";
import type { Clock } from "../Runtime/Clock";
import { canEditSettings, canReadSettings } from "./Policy";
import type { SettingsRepo } from "./SettingsRepo";

export type SettingsDeps = {
  readonly clock: Clock;
  readonly repo: SettingsRepo;
};

export const makeSettingsService = (deps: SettingsDeps) => {
  // An absent row is the defaults. Reading never writes one: a read that inserts is a write on
  // every settings screen open, for a value the absence already states. A session whose user row
  // is gone is `ProfileNotFound`, as it is on `/me`, rather than defaults for nobody.
  const get = async (actor: Actor): Promise<UserSettings> => {
    const userId = canReadSettings(actor.id, actor);
    const read = await deps.repo.byUser(userId);
    if (read === null) {
      throw new ProfileNotFound({ id: actor.id });
    }
    return read.saved ?? SETTINGS_DEFAULTS;
  };

  return {
    get,

    // `{}` writes nothing: a no-op patch must neither create a row nor move `updatedAt`. It still
    // answers through `get`, so a gone account is a 404 on either path.
    update: async (
      actor: Actor,
      patch: UserSettingsPatch
    ): Promise<UserSettings> => {
      const userId = canEditSettings(actor.id, actor);
      if (!hasChanges(patch)) {
        return get(actor);
      }
      if (
        !(await deps.repo.upsert(
          userId,
          SETTINGS_DEFAULTS,
          patch,
          deps.clock.now()
        ))
      ) {
        throw new ProfileNotFound({ id: actor.id });
      }
      return get(actor);
    },
  };
};

export type SettingsService = ReturnType<typeof makeSettingsService>;
