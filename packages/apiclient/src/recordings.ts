import type { AudioContentType } from "@gc/domain/Domain/Recording";
import type {
  createRecordingRoute,
  discardRecordingRoute,
  endRecordingRoute,
  getRecordingRoute,
  patchRecordingRoute,
  retryRecordingRoute,
  uploadRecordingAudioRoute,
} from "@gc/domain/Recordings/Contract";
import type { Endpoint, RequestOptions } from "./client";

export type UploadAudioInput = {
  readonly body: BodyInit;
  readonly contentType: AudioContentType;
  readonly params: { readonly id: string };
};

// `import type` only, as in `notes.ts`. The audio route declares no JSON body, so its bytes travel
// through the `body` escape hatch untouched: re-encoding a recording would be the one thing worse
// than the size of it. `fetch` sets Content-Length itself for a Blob, a buffer or a file.
export const makeRecordingsApi = (endpoint: Endpoint) => {
  const putAudio = endpoint<typeof uploadRecordingAudioRoute>(
    "put",
    "/recordings/{id}/audio"
  );
  return {
    createRecording: endpoint<typeof createRecordingRoute>(
      "post",
      "/recordings"
    ),
    discardRecording: endpoint<typeof discardRecordingRoute>(
      "delete",
      "/recordings/{id}"
    ),
    endRecording: endpoint<typeof endRecordingRoute>(
      "post",
      "/recordings/{id}/end"
    ),
    getRecording: endpoint<typeof getRecordingRoute>("get", "/recordings/{id}"),
    retryRecording: endpoint<typeof retryRecordingRoute>(
      "post",
      "/recordings/{id}/retry"
    ),
    updateRecording: endpoint<typeof patchRecordingRoute>(
      "patch",
      "/recordings/{id}"
    ),
    uploadRecordingAudio: (
      { body, contentType, params }: UploadAudioInput,
      options: Omit<RequestOptions, "body"> = {}
    ) =>
      putAudio(
        { params },
        {
          ...options,
          body,
          headers: { ...options.headers, "content-type": contentType },
        }
      ),
  };
};
