import type { Policy } from "../Auth/Policy";
import type { ChatThreadRecord } from "./ChatsRepo";

export const READ_CHAT = "chats.read";
export const WRITE_CHAT = "chats.write";

// Plain `Policy` values, as for notes: a thread the caller may not see must fail as `ChatNotFound`,
// never `Forbidden` (D018), so the service asks `holds` and brands through `ensure` once it is yes.
export const canReadChat: Policy<ChatThreadRecord> = {
  action: READ_CHAT,
  holds: (thread, actor) => thread.ownerId === actor.id,
};

// Asking, pinning, rating and deleting. The same rule as reading today; a separate action so that
// sharing a chat for reading one day does not hand out writing with it.
export const canWriteChat: Policy<ChatThreadRecord> = {
  action: WRITE_CHAT,
  holds: (thread, actor) => thread.ownerId === actor.id,
};
