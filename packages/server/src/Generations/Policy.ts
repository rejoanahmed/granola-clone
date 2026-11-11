import type { NoteId, UserId } from "@kn/domain/Domain/Ids";
import type { Policy } from "../Auth/Policy";

export const RETRY_GENERATION = "generations.retry";

// Ownership goes through the note, the only thing a caller can name. A plain `Policy` as the notes
// ones are: a note the caller may not see is `NoteNotFound`, never `Forbidden` (D018).
export const canRetryGeneration: Policy<{
  readonly noteId: NoteId;
  readonly ownerId: UserId;
}> = {
  action: RETRY_GENERATION,
  holds: (note, actor) => note.ownerId === actor.id,
};
