import type { Profile } from "@gc/domain/Domain/Profile";
import { ProfileNotFound } from "@gc/domain/Profile/Errors";
import type { Actor } from "../Auth/Actor";
import type { Authorized } from "../Auth/Policy";
import { canReadProfile } from "./Policy";
import type { ProfilesRepo } from "./ProfilesRepo";

export type ProfilesDeps = {
  readonly repo: ProfilesRepo;
};

export const makeProfilesService = (deps: ProfilesDeps) => ({
  // A live session whose user row is gone is a 404, not a 401: the credential is valid, the thing
  // it names is not, and the client's answer to the two differs (re-sign-in vs. "account deleted").
  me: async (actor: Actor): Promise<Authorized<Profile>> => {
    const profile = await deps.repo.byId(actor.id);
    if (profile === null) {
      throw new ProfileNotFound({ id: actor.id });
    }
    return canReadProfile(profile, actor);
  },
});

export type ProfilesService = ReturnType<typeof makeProfilesService>;
