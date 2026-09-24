import type {
  createNoteRoute,
  getNoteRoute,
  getNoteTranscriptRoute,
  listNotesRoute,
  patchNoteRoute,
  restoreNoteRoute,
  retryNoteGenerationRoute,
  trashNoteRoute,
} from "@gc/domain/Notes/Contract";
import type { Endpoint } from "./client";

// `import type` only, as in `profiles.ts`: the route constants are read for their types, and a
// value import would put zod and `@hono/zod-openapi` in the app bundle.
export const makeNotesApi = (endpoint: Endpoint) => ({
  createNote: endpoint<typeof createNoteRoute>("post", "/notes"),
  getNote: endpoint<typeof getNoteRoute>("get", "/notes/{id}"),
  getNoteTranscript: endpoint<typeof getNoteTranscriptRoute>(
    "get",
    "/notes/{id}/transcript"
  ),
  listNotes: endpoint<typeof listNotesRoute>("get", "/notes"),
  restoreNote: endpoint<typeof restoreNoteRoute>("post", "/notes/{id}/restore"),
  retryNoteGeneration: endpoint<typeof retryNoteGenerationRoute>(
    "post",
    "/notes/{id}/generation/retry"
  ),
  trashNote: endpoint<typeof trashNoteRoute>("post", "/notes/{id}/trash"),
  updateNote: endpoint<typeof patchNoteRoute>("patch", "/notes/{id}"),
});
