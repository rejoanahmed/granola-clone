import type { UserId } from "@kn/domain/Domain/Ids";
import { make } from "../Auth/Policy";

export const READ_CALENDAR = "calendar.read";

// Trivially true while the only calendar a caller can name is their own. It exists so the day a
// shared or delegated calendar arrives, the check is already where a reviewer looks.
export const canReadCalendar = make<UserId>(
  READ_CALENDAR,
  (userId, actor) => userId === actor.id
);
