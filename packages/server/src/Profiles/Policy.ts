import type { Profile } from "@gc/domain/Domain/Profile";
import { make } from "../Auth/Policy";

export const READ_PROFILE = "profiles.read";
export const EDIT_PROFILE = "profiles.edit";

// Trivially true for `/me` today, because the id comes from the caller's own session. It exists so
// that the day a route takes a user id from the path, the check is already in the one place a
// reviewer looks for it — and the `Authorized<Profile>` brand makes skipping it a compile error.
export const canReadProfile = make<Profile>(
  READ_PROFILE,
  (profile, actor) => profile.id === actor.id
);

// A separate action from reading, though the rule is the same today: the first time someone other
// than the owner may read a profile (a teammate, an admin), editing must not come along for free.
export const canEditProfile = make<Profile>(
  EDIT_PROFILE,
  (profile, actor) => profile.id === actor.id
);
