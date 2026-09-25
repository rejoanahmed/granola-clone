import type { Profile } from "@gc/domain/Domain/Profile";
import { make } from "../Auth/Policy";

export const SEND_SUPPORT = "support.send";

// A support message is signed with the sender's own name and address, so the subject is the
// caller's profile. Trivially true today; it is the place the rule lives when one arrives (a
// suspended account, a per-user rate limit — see BLOCKERS.md).
export const canSendSupport = make<Profile>(
  SEND_SUPPORT,
  (profile, actor) => profile.id === actor.id
);
