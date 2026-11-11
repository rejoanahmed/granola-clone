import type { UserId } from "@kn/domain/Domain/Ids";
import { make } from "../Auth/Policy";

export const READ_SETTINGS = "settings.read";
export const EDIT_SETTINGS = "settings.edit";

// Both trivially true while the only route is `/me/settings`: the id is the caller's own. They exist
// so that the day an id arrives from anywhere else, the check is already where a reviewer looks —
// and, as with profiles, reading and editing are separate actions so one cannot come free with the
// other.
export const canReadSettings = make<UserId>(
  READ_SETTINGS,
  (userId, actor) => userId === actor.id
);

export const canEditSettings = make<UserId>(
  EDIT_SETTINGS,
  (userId, actor) => userId === actor.id
);
