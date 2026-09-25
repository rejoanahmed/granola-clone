import type { UserId } from "@gc/domain/Domain/Ids";
import { make } from "../Auth/Policy";

export const EDIT_SETTINGS = "settings.edit";

// Trivially true while the only route is `/me/settings`: the id is the caller's own. It exists so
// that the day an id arrives from anywhere else, the check is already where a reviewer looks.
export const canEditSettings = make<UserId>(
  EDIT_SETTINGS,
  (userId, actor) => userId === actor.id
);
