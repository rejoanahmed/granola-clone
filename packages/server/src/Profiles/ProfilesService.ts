import type {
  DeletionPreview,
  Profile,
  ProfilePatch,
} from "@gc/domain/Domain/Profile";
import { ProfileNotFound } from "@gc/domain/Profile/Errors";
import type { Actor } from "../Auth/Actor";
import type { Authorized } from "../Auth/Policy";
import type { NotesRepo } from "../Notes/NotesRepo";
import type { Clock } from "../Runtime/Clock";
import { canEditProfile, canReadProfile } from "./Policy";
import type { ProfilesRepo } from "./ProfilesRepo";

export type ProfilesDeps = {
  readonly clock: Clock;
  // Only the count: the preview promises how many notes a deletion takes, and nothing here may
  // read or write a note beyond that.
  readonly notes: Pick<NotesRepo, "countLive">;
  readonly repo: ProfilesRepo;
};

const hasChanges = (patch: ProfilePatch): boolean =>
  Object.values(patch).some((value) => value !== undefined);

export const makeProfilesService = (deps: ProfilesDeps) => {
  // A live session whose user row is gone is a 404, not a 401: the credential is valid, the thing
  // it names is not, and the client's answer to the two differs (re-sign-in vs. "account deleted").
  const existing = async (actor: Actor): Promise<Profile> => {
    const profile = await deps.repo.byId(actor.id);
    if (profile === null) {
      throw new ProfileNotFound({ id: actor.id });
    }
    return profile;
  };

  const me = async (actor: Actor): Promise<Authorized<Profile>> =>
    canReadProfile(await existing(actor), actor);

  // Read, check, write, read again. The first read is what turns a deleted account into
  // `ProfileNotFound` and is the subject the policy needs; an account deleted between that read
  // and the write is caught by the repo, which answers `false` rather than the foreign key's 500. The id written is the actor's, never one from input, so no patch can reach another row.
  const editing = async (actor: Actor): Promise<Authorized<Profile>> =>
    canEditProfile(await existing(actor), actor);

  return {
    completeOnboarding: async (actor: Actor): Promise<Authorized<Profile>> => {
      const subject = await editing(actor);
      if (!(await deps.repo.markOnboarded(subject.id, deps.clock.now()))) {
        throw new ProfileNotFound({ id: actor.id });
      }
      return me(actor);
    },

    // Checked on the existing profile, so a deleted account is `ProfileNotFound`; a second delete
    // racing the first finds no row to remove and answers the same.
    deleteAccount: async (actor: Actor): Promise<void> => {
      const subject = await editing(actor);
      if (!(await deps.repo.deleteUser(subject.id))) {
        throw new ProfileNotFound({ id: actor.id });
      }
    },

    deletionPreview: async (actor: Actor): Promise<DeletionPreview> => {
      const subject = await me(actor);
      return { noteCount: await deps.notes.countLive(subject.id) };
    },

    me,

    // `{}` writes nothing: a no-op PATCH must not create a row or move `updatedAt`. What it answers
    // still passes the read policy, so a no-op edit can never become a read that skipped it.
    update: async (
      actor: Actor,
      patch: ProfilePatch
    ): Promise<Authorized<Profile>> => {
      const subject = await editing(actor);
      if (!hasChanges(patch)) {
        return canReadProfile(subject, actor);
      }
      if (
        !(await deps.repo.upsertDetails(subject.id, patch, deps.clock.now()))
      ) {
        throw new ProfileNotFound({ id: actor.id });
      }
      return me(actor);
    },
  };
};

export type ProfilesService = ReturnType<typeof makeProfilesService>;
