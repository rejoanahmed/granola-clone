import { createRoute, z } from "@hono/zod-openapi";
import { Note } from "../Domain/Note";
import {
  AUDIO_CONTENT_TYPES,
  Recording,
  RecordingCreate,
  RecordingEnd,
  RecordingId,
  RecordingPatch,
} from "../Domain/Recording";
import { commonErrors, ErrorBody, json, jsonBody, params } from "../Http";

// Owner-scoped by construction, as Notes is: another user's recording answers exactly as an absent
// one, so no route documents a 403 of its own.

const RecordingParams = params({ id: RecordingId });

const notFound = json(
  ErrorBody,
  "RecordingNotFound: no such recording, or not the caller's — the two are indistinguishable"
);

const notActive = json(
  ErrorBody,
  "RecordingNotActive: the recording has already ended; details.status says what it is now"
);

export const RecordingCreated = z.object({ note: Note, recording: Recording });
export type RecordingCreated = z.infer<typeof RecordingCreated>;

// Raw bytes, not JSON. zod-openapi attaches no validator to a non-JSON, non-form media type, so the
// content type and the size are the service's to refuse (415, 413, 422) — which is what lets a cron
// or a test reach the same rules without HTTP (R6).
const AudioBytes = z.string().openapi({ format: "binary" });
const audioBody = {
  content: Object.fromEntries(
    AUDIO_CONTENT_TYPES.map((type) => [type, { schema: AudioBytes }])
  ),
  required: true,
};

export const createRecordingRoute = createRoute({
  description:
    'Starts a recording: creates its note (title "Untitled note", source phone, the caller as the only attendee, startedAt the body\'s value or now) and a recording in status recording. The audio itself stays on the device until End. With calendarEventId, the note takes the meeting\'s title (cut at a word to 200 characters; a blank one stays "Untitled note") and its attendees after the caller (the caller\'s own address dropped, deduplicated, at most 50), and is linked to the meeting.',
  method: "post",
  path: "/recordings",
  request: { body: jsonBody(RecordingCreate) },
  responses: {
    201: json(RecordingCreated, "The new note and its recording"),
    404: json(
      ErrorBody,
      "CalendarEventNotFound: calendarEventId is not on the caller's calendar; details.calendarEventId"
    ),
    409: json(
      ErrorBody,
      "CalendarEventHasNote: the caller already has a live note for this meeting; details.noteId names it"
    ),
    503: json(
      ErrorBody,
      "CalendarUnavailable: the calendar could not be read; nothing was written"
    ),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Start a recording",
  tags: ["Recordings"],
});

export const getRecordingRoute = createRoute({
  description:
    "One of the caller's recordings. Poll this while status is uploading or transcribing.",
  method: "get",
  path: "/recordings/{id}",
  request: { params: RecordingParams },
  responses: {
    200: json(Recording, "The recording"),
    404: notFound,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Read a recording",
  tags: ["Recordings"],
});

export const patchRecordingRoute = createRoute({
  description:
    "Saves the notes typed during a live recording. Last write wins. Only a recording in status recording accepts it.",
  method: "patch",
  path: "/recordings/{id}",
  request: { body: jsonBody(RecordingPatch), params: RecordingParams },
  responses: {
    200: json(Recording, "The recording, after the patch"),
    404: notFound,
    409: notActive,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Save a live recording's notes",
  tags: ["Recordings"],
});

export const discardRecordingRoute = createRoute({
  description:
    "Throws a live recording away: hard-deletes its note, the recording, any segments and the audio object. Not a trash — there is no Undo. Only a recording in status recording can be discarded; a finished one is trashed through its note.",
  method: "delete",
  path: "/recordings/{id}",
  request: { params: RecordingParams },
  responses: {
    204: { description: "Discarded" },
    404: notFound,
    409: notActive,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Discard a live recording",
  tags: ["Recordings"],
});

export const endRecordingRoute = createRoute({
  description:
    "Stops the recording: status uploading, durationMs from the body (the device's timer, which knows about pauses), endedAt now. Replaying it on an uploading recording is a no-op that returns it, so a retried request after a lost response is safe.",
  method: "post",
  path: "/recordings/{id}/end",
  request: { body: jsonBody(RecordingEnd), params: RecordingParams },
  responses: {
    200: json(Recording, "The recording, now uploading"),
    404: notFound,
    409: notActive,
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "End a recording",
  tags: ["Recordings"],
});

export const uploadRecordingAudioRoute = createRoute({
  description:
    "The recorded audio, as the raw request body, with Content-Length set. Stores it, then submits it for transcription keyed on the recording id. Status becomes transcribing, or transcribed when the transcriber answers at once, or failed. A replay on transcribing or transcribed is a no-op that neither stores nor submits again.",
  method: "put",
  path: "/recordings/{id}/audio",
  request: { body: audioBody, params: RecordingParams },
  responses: {
    200: json(Recording, "The recording, after the upload"),
    400: json(
      ErrorBody,
      "AudioLengthMismatch: the body did not match its Content-Length"
    ),
    404: notFound,
    409: json(
      ErrorBody,
      "RecordingNotUploading: the recording has not been ended yet"
    ),
    411: json(
      ErrorBody,
      "AudioLengthRequired: no Content-Length, so the size cannot be checked"
    ),
    413: json(ErrorBody, "AudioTooLarge: over 100 MB"),
    415: json(ErrorBody, "UnsupportedAudioType: not one of the audio types"),
    ...commonErrors,
    422: json(ErrorBody, "EmptyAudio (zero bytes), or validation failed"),
  },
  security: [{ sessionCookie: [] }],
  summary: "Upload a recording's audio",
  tags: ["Recordings"],
});

export const retryRecordingRoute = createRoute({
  description:
    "Submits the stored audio again after a failure. Status becomes transcribing, transcribed or failed, exactly as after an upload.",
  method: "post",
  path: "/recordings/{id}/retry",
  request: { params: RecordingParams },
  responses: {
    200: json(Recording, "The recording, after the retry"),
    404: notFound,
    409: json(
      ErrorBody,
      "RecordingNotRetryable: only a failed recording can be retried"
    ),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Retry a failed transcription",
  tags: ["Recordings"],
});
