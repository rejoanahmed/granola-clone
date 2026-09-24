// Every string the recording journey shows (docs/spec/phase-5.md §4). Flows assert by id; the unit
// tests assert by these strings, so a copy change is one edit here.
export const MIC_COPY = {
  close: "Close",
  continue: "Continue",
  deniedBody:
    "Turn on the microphone for Notes in Settings to start transcribing.",
  deniedTitle: "Microphone access is off",
  openSettings: "Open Settings",
  primerTitle: "Enable your microphone to start transcribing",
} as const;

export const RECORDING_COPY = {
  addAttachment: "Add attachment",
  addToFolder: "Add to folder",
  cancel: "Cancel",
  discard: "Discard",
  discardConfirmBody: "The recording and your notes will be deleted.",
  discardConfirmCancel: "Cancel",
  discardConfirmTitle: "Discard this note?",
  discarded: "Note discarded",
  discardFailed: "Couldn’t discard the note",
  discardNote: "Discard note",
  end: "End",
  hideKeyboard: "Hide keyboard",
  minimize: "Minimize note",
  more: "More",
  notesPlaceholder: "Write notes here...",
  pause: "Pause recording",
  paused: "Paused",
  privateNotes: "Private notes",
  resume: "Resume recording",
  returnToRecording: "Return to recording",
  startFailed: "Couldn’t start recording.",
  startFailedClose: "Close",
} as const;

export const NOTE_STATUS_COPY = {
  interrupted: "This recording didn’t finish.",
  retry: "Retry",
  transcriptionFailed: "Couldn’t transcribe this recording.",
  uploadFailed: "Couldn’t upload the recording.",
  uploading: "Uploading transcript...",
} as const;
