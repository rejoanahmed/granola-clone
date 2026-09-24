import type { Policy } from "../Auth/Policy";
import type { RecordingRecord } from "./RecordingsRepo";

export const READ_RECORDING = "recordings.read";
export const EDIT_RECORDING = "recordings.edit";

// Plain `Policy` values, as the notes policies are: a recording the caller may not see fails as
// `RecordingNotFound`, never `Forbidden` (docs/DECISIONS.md D018), so the service asks `holds` and
// brands through `ensure` only once the answer is yes.
export const canReadRecording: Policy<RecordingRecord> = {
  action: READ_RECORDING,
  holds: (recording, actor) => recording.ownerId === actor.id,
};

// Separate from reading for the same reason as notes: sharing a recording for listening must not
// bring the right to end, discard or re-transcribe it.
export const canEditRecording: Policy<RecordingRecord> = {
  action: EDIT_RECORDING,
  holds: (recording, actor) => recording.ownerId === actor.id,
};
