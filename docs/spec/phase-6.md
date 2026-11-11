# Phase 6 — AI notes

When a recording's transcript lands, a queued job hands the transcript, the user's typed private
notes and the attendees to an LLM. The LLM writes a **title** and **structured markdown notes**:
`###` section headings, bullets, nested bullets, and bold "next step" items with a description
paragraph under each (#10, #11). A recording with almost no speech gets the canned two-paragraph
body instead (#40, #107). The note page shows **"Generating notes..."** while the job runs (#106),
then the finished note (#107). Every provider is a fake. The LLM is `LlmFake`, selected by
`LLM_MODE`, in the same shape as the phase-5 transcriber.

The job is a Cloudflare Queue message with an **idempotent claim** on a `note_generations` row.
This is the shape hono-port's summariser uses: a claim first, a guarded write after it, a sweep for
anything the queue lost, and a failure classification that decides between retrying and giving up.

Discovery covers the generating row (#106), a finished short note (#107), a long generated note
(#10, #11), the low-content body (#40) and the markdown source behind a note (#31). A generation
failure, its retry, a transcript of silence and a rename during generation were **never seen**.
This spec designs them in the same visual language and marks each one *(designed)*.

Screens: `#NN` is `~/personal/granola-clone-discovery/screens/NN-*/`. Tokens come from the discovery
README and the phase-2 `design/tokens.ts`. Layout numbers are iOS points on the 428pt discovery
device. The clone runs at 402pt, so horizontal measurements are relative to the 20pt phase-2
gutter.

---

## 1. Scope

| In | Out (and where it goes) |
| --- | --- |
| The "Generating notes..." status row (#106) after "Uploading transcript..." (#105) | Regenerate or "enhance" on demand, templates, a choice of model for notes (never seen) |
| The finished note with its AI title and AI body (#107, #10, #11) | Chat over the note: the Ask pill stays as phase 4 left it, and phase 7 owns it |
| The low-content canned body (#40, #107) | A live LLM client (blocker, §10) |
| The generation-failed row and its Retry *(designed)* | Streaming the notes in as they are written (never seen: #106 shows only a spinner) |
| The generated markdown rendered with the phase-4 renderer, and visible as source in Edit notes (#31) | Speaker names in the notes: the transcript has letters only (phase 5) |
| API: `note_generations`, the LLM port and fake, the output parser, the queue, its consumer, the sweep, and retry | Generating notes for a note typed by hand (no recording, so no job) |

---

## 2. Journey

```
End (phase 5) ─▶ note page
  "Uploading transcript..."  (recording: uploading → transcribing)            #105
      │ transcript settles (upload answer, sweep, or harness release)
      ▼
  "Generating notes..."      (generation: queued → generating)                #106
      │                                      │
      │ LLM answers                          │ LLM fails for good
      ▼                                      ▼
  finished note: AI title + AI body   "Couldn’t generate notes." + Retry  (designed)
  (#107 short / #10 long)                    │ Retry
                                             └─▶ "Generating notes..." ...
```

A transcription failure (phase 5) never reaches generation. Its Retry leads back through
"Uploading transcript..." and then into this journey.

---

## 3. Screens and states

### 3.1 Note page status row (#106), the phase-5 `note-status`

The row is the phase-5 row, with the same chrome: full width, fill `#333333`, radius 24, 48pt tall,
a `#8A8A8A` spinner and grey 17pt text (`note-status-text`). It sits between the metadata row and
the body. Phase 6 adds two texts:

| State | When | Row | Rest of page |
| --- | --- | --- | --- |
| Uploading (#105, phase 5) | client uploading, or recording `uploading`/`transcribing` | spinner + **"Uploading transcript..."** | title grey if default; no Share or More; body hidden |
| **Generating (#106)** | recording `transcribed` and generation `queued` or `generating` | spinner + **"Generating notes..."** | the same as Uploading. The typed private notes are **not** shown, as #106 notes |
| **Generation failed** *(designed)* | generation `failed` | `#FE4346` alert-circle glyph + **"Couldn’t generate notes."** + an inline **"Retry"** text button (`note-status-retry`) | Share and More appear. The title stays "Untitled note" in the phase-4 colour. The body is the fallback: the typed private notes, or the phase-4 `note-body-empty` state. More → View transcript is offered, because the transcript exists |
| Finished (#107, #10) | generation `generated`, or no generation row at all | none | Share and More appear; the AI title and AI body |
| Transcription failed / interrupted / upload failed (phase 5) | unchanged | unchanged | unchanged |

- Precedence stays as phase 5 wrote it (a local upload outranks the server). The generation rows
  are consulted only once the recording reads `transcribed`.
- **Polling.** The page polls `GET /notes/{id}` every 2 s while the recording is `uploading` or
  `transcribing`, **or** the generation is `queued` or `generating`. It stops when the page loses
  focus.
- **Retry** calls `POST /notes/{id}/generation/retry`. The row goes back to "Generating notes..."
  as soon as the call answers. If the call itself fails, the toast **"Couldn’t retry. Try again."**
  appears *(designed)*.
- **The finishing transition** *(designed; #106 → #107 was a cut)*: the status row collapses (its
  height animates to 0 over 200 ms). The title recolours from `#A8AAA1` to `#FCFDF8` and its text
  swaps. The body fades in over 200 ms. Nothing slides, so the metadata pill stays where it was.

### 3.2 The finished note (#10, #11, #107), the phase-4 `note-screen`

The page is phase 4's detail with the phase-5 conditions. Phase 6 changes what the server writes,
not how the page draws it:

- **Title** (`note-title`): the generated title, serif display ~40pt, `#FCFDF8`, wrapping (#107
  wraps to 2 lines). The rule in §6.4 decides whether the generated title is written.
- **Body** (`note-body`, blocks `note-block-<i>`): the generated markdown, rendered by the phase-4
  renderer (`features/notes/markdown.ts` and `NoteMarkdown.tsx`) with no new constructs. What #10
  and #11 show, and what phase 6 checks in the screenshots:
  - a section heading `### X`: SF Pro 17pt **semibold**, `#FCFDF8`, not serif. It has 32pt above
    it, 0pt before the first heading, and 8pt below it;
  - a top-level bullet `- x`: a filled grey dot (`#8A8A8A`) at the gutter + 14, with the text at
    gutter + 32, 17pt, line height 24, `#E8E8E3`, and 12pt between bullets;
  - a nested bullet (two-space indent): a hollow grey circle at gutter + 38, with the text at
    gutter + 56;
  - a next-step pair, `- **Title**` followed by an indented paragraph: a bold 17pt line, then the
    description as a continuation block at the bullet's text indent, in regular weight;
  - an italic `_x_` span (#40's second paragraph, and both #107 paragraphs), drawn in SF Pro Italic;
  - no footer after the last block (#11). The Ask pill floats over the scrolled content.
- **Low-content body** (#40): two paragraphs. The first comes from the LLM, in regular weight. The
  second is the fixed tip in italics. 16pt separates them. The body is drawn at the same size and
  colours as any other paragraph.
- **More** keeps the phase-5 order: **Edit notes · View transcript · Copy notes · Move to trash**
  (#12, #41). Edit notes opens the generated markdown source, as #31 shows (`### Code Review
  Session`, `- item`, `  - nested`, `- **Bold**` + an indented description).
- **Share** and **Copy notes** use the generated body, through the phase-4 share-text builder. Nothing
  changes there.

### 3.3 Home

No new ids. Once generation finishes, the row's title (`home-note-<id>`, a11y `"<title>, <time>"`)
reads the generated title. The phase-5 refetch on returning to home is what shows it, and no
row-level "generating" affordance exists (#01 never showed one).

---

## 4. Copy

Every string is verbatim from COPY.md, with Granola replaced by Notes, or marked *(designed)*.

| Where | String |
| --- | --- |
| Status row | Uploading transcript... (seen, phase 5) · **Generating notes...** (seen, #106) |
| Generation failed *(designed)* | Couldn’t generate notes. · Retry |
| Retry failure toast *(designed)* | Couldn’t retry. Try again. |
| Low-content tip, fixed (#40; appended by the server, never written by the LLM) | _Notes works best with real conversations, meetings, or notes to self. Try recording a call, a catch-up, or even a personal brain dump._ |
| Low-content first paragraph, from the fake LLM (#40) | Not much to transcribe here. The recording captured only a brief greeting with no substantive discussion, decisions, or follow-ups. |
| The same, for a transcript of silence *(designed)* | Not much to transcribe here. The recording didn’t capture any speech. |
| The same, when private notes were typed *(designed, after #107's "the typed note…" sentence)* | the sentence above, then ` Your typed notes: “<first line>”.` |
| Fake short title *(designed)* | Brief check-in |
| Fake full-note headings *(designed)* | Discussion · Your notes · Next Steps |
| Fake next steps *(designed)* | **Confirm owners for the open items** / Agree who takes each open question raised in this conversation. · **Share these notes with the attendees** / Send the summary to everyone who was in the meeting. |

Two tips were observed. #40's is used because the phase plan names #40, and because the seeded
`not_e2e_solo` body (phase 4) already carries it, so a generated short note and the seeded one read
the same. #107's variant ("— whenever you’re ready to capture something meaningful, it’ll be
there.") is not used.

The native strings live in `apps/native/src/features/recording/copy.ts` (`NOTE_STATUS_COPY` gains
`generating` and `generationFailed`, and `retryFailed` is new). The tip lives in
`packages/domain/src/Domain/Generation.ts` as `LOW_CONTENT_TIP`, so the server that writes it and
any test that reads it share one constant.

---

## 5. testIDs

Phase 6 adds **no new ids**. Every state is expressed through existing ones, which keeps the
phase-5 flows valid:

| Screen | testIDs used |
| --- | --- |
| Note page | `note-screen`, `note-title`, `note-meta-pill`, `note-back`, `note-share`, `note-more`, `note-status`, `note-status-text`, `note-status-retry`, `note-body`, `note-block-<i>`, `note-body-end`, `note-body-empty` |
| More | `note-menu`, `note-menu-edit`, `note-menu-transcript`, `note-menu-copy`, `note-menu-trash` (phase 4/5 ids) |
| Editor | `note-editor-screen`, `note-editor-input`, `note-editor-close` (phase 4 ids) |
| Home | `home-note-<id>`, `home-note-menu`, `home-note-menu-edit-title`, `rename-sheet`, `rename-input`, `rename-save` |
| Toast | `toast`, `toast-message` |

---

## 6. API

Every route is authenticated and owner-scoped. Another user's note is a **404** identical to an
absent one (D018). Timestamps are epoch ms (D003).

### 6.1 Endpoints

| Route | Body | Success | Errors |
| --- | --- | --- | --- |
| `GET /notes/{id}` — `getNoteRoute` (changed) | — | 200 `Note`, now carrying `generation` (§6.2) | 404 `NoteNotFound` |
| `GET /notes` — `listNotesRoute` (unchanged shape) | — | 200. Summaries carry the generated title once it is written | — |
| `POST /notes/{id}/generation/retry` — `retryNoteGenerationRoute` (in `Notes/Contract.ts`, served by the Generations service, as `getNoteTranscriptRoute` is served by Recordings) | — | 200 `NoteGeneration`, status `queued`, `attempt` reset to 0, `failure` null. The job is enqueued | 404 `NoteNotFound`, 409 `GenerationNotRetryable` (no generation row, or its status is not `failed`) |

No endpoint starts a generation. The transcript settling is the only trigger. It is written in the
same batch that marks the recording `transcribed` (§6.4), so no client call can create a job, or
forget to.

### 6.2 Shapes (`packages/domain/src/Domain/Generation.ts`)

```ts
GenerationId = branded("GenerationId", "gen_")
GenerationStatus = z.enum(["queued", "generating", "generated", "failed"])
// Named for what happened, like RecordingFailure. Only `output_truncated` and `llm_rejected` are
// terminal on the first attempt; the rest are retried up to GENERATION_MAX_ATTEMPTS.
GenerationFailure = z.enum([
  "llm_unavailable", "llm_timeout", "llm_rejected", "output_malformed", "output_truncated",
])

NoteGeneration = z.object({
  failure: GenerationFailure.nullable(),     // non-null iff status = failed
  status: GenerationStatus,
  updatedAt: Timestamp,
})
Note += { generation: NoteGeneration.nullable() }   // null: typed by hand, or not yet transcribed

LOW_CONTENT_TIP = "_Notes works best with real conversations, meetings, or notes to self. Try recording a call, a catch-up, or even a personal brain dump._"
// Fewer than this many words across the transcript's utterances is a low-content recording.
LOW_CONTENT_MAX_WORDS = 12
isLowContent(utterances: readonly Utterance[]): boolean   // pure; words = /\S+/g matches
GENERATED_TITLE_MAX = 80                                   // ≤ NOTE_TITLE_MAX
```

`isLowContent` counts the **transcript only**. Private notes do not lift a recording out of it,
which matches #107: a typed test note still got the short body. The fake transcriber's greeting is
4 words, and silence is 0. Its shortest ≥ 60 s answer is 4 segments of at least 4 words each, 16
words, so the long flow is never low-content.

### 6.3 Storage (`packages/db`)

- `note_generations`: `attempt` int not null default 0, `claimed_at` int null, `created_at`, `failure`
  text null, `id` pk (`gen_`), `note_id` text **unique** → `notes.id` on delete cascade, `owner_id`
  → `user.id` cascade, `recording_id` text unique → `recordings.id` on delete cascade, `status` text
  not null, `updated_at`. Index `note_generations_pending_idx` on (`status`, `updated_at`) where
  status in ('queued', 'generating'), for the sweep. Keys are alphabetical. The migration is
  generated with `db:generate`.
- `RESET_ORDER` gains `noteGenerations` before `recordings` and `notes`.
- **The seed** gives `rec_e2e_launch`, `rec_e2e_solo` and `rec_e2e_other` a `generated` row, so every
  seeded recording reads as finished through the same field as a real one. `not_e2e_standup` has
  none (typed by hand).

### 6.4 The job

**Enqueue.** `RecordingsRepo.stageComplete` (phase 5) also stages
`insert into note_generations (… status 'queued') on conflict (note_id) do nothing` in the same
batch as the `transcribed` claim. Only the batch that wins the claim writes a row, so a settle
racing a sweep can never make two. After the commit, `RecordingsService` calls
`generationQueue.send({ generationId })`. A failed send is logged
(`generation.enqueue.failed`) and swallowed: the recording is already `transcribed`, so failing the
upload would buy only a replay that can no longer claim anything, and the sweep re-enqueues the
row. The phase-5 copy of the private notes into an empty body stays. That copy is the fallback
the page shows if generation fails.

**Run** (`GenerationsService.run(generationId) → "done" | "retry" | "skipped"`), the queue
consumer's one call:

1. **Claim.** `update … set status='generating', attempt=attempt+1, claimed_at=now where id=? and
   (status='queued' or (status='generating' and claimed_at < now − GENERATION_STALE_AFTER_MS))
   returning *`. No row means another delivery holds it or it is finished, so return `skipped` and
   ack. A redelivery never buys a second LLM call.
2. **Read** the note, its attendees, the recording's private notes and the grouped utterances
   (`groupUtterances`).
3. **Ask.** Call `llm.generateNote({ key: "<generationId>:<attempt>", kind, utterances,
   privateNotes, attendeeNames, startedAt })`, where `kind = isLowContent(utterances) ? "brief" :
   "full"`.
4. **Parse** the answer with `parseGeneratedNote(raw, { truncated })` (§6.5). For `brief`, the body
   is the parsed first paragraph + `\n\n` + `LOW_CONTENT_TIP`. The tip is product copy, so the LLM
   never writes it.
5. **Write**, in one batch:
   - `note_generations` → `generated` where `id = ? and status = 'generating' and attempt = <claimed>`. This is the latch;
   - `notes.title` = the generated title **only where the title is still `"Untitled note"`**. A rename during generation wins;
   - `notes.body_markdown` = the generated body **only where the body is still `''` or equal to the recording's private notes** (the phase-5 fallback). Words the user wrote win;
   - `notes.updated_at` = now, on whichever of the two notes writes changed a row.

   The note writes are conditional on the latch statement in the same batch (`… and exists (select 1
   from note_generations where id = ? and status = 'generated' and attempt = <claimed>)`), so a
   stale claim that lost the latch changes nothing. The title and body rules use no clock and no
   policy, so they stay in the repository (R2).
6. **Failure classification**, the same switch as `failureOf` in phase 5:

   | Thrown | Row | Queue |
   | --- | --- | --- |
   | `LlmRateLimited` (429) | back to `queued`, `attempt − 1` (not spent) | ack; the sweep re-enqueues it |
   | `LlmUnavailable` 503, `LlmTimeout` 504, `GeneratedNoteMalformed`, with `attempt < GENERATION_MAX_ATTEMPTS` | back to `queued` | `retry({ delaySeconds: GENERATION_RETRY_DELAY_S })` |
   | the same at the last attempt | `failed` + failure | ack |
   | `LlmRejected` 422, or a truncated answer | `failed` (`llm_rejected` / `output_truncated`) at once | ack |
   | a database error of ours | untouched (still `generating`) | throw; the queue retries, and the stale-claim rule lets the retry reclaim it |

   Every row write in this table is guarded on `status = 'generating' and attempt = <claimed>`.

**Constants** (`Generations/GenerationsService.ts`): `GENERATION_MAX_ATTEMPTS = 3`,
`GENERATION_RETRY_DELAY_S = 30`, `LLM_TIMEOUT_MS = 120_000`, and
`GENERATION_STALE_AFTER_MS = LLM_TIMEOUT_MS + 60_000`. That last one is **derived, never written
down**, so it always outlasts one attempt. `QUEUED_STALE_AFTER_MS = 2 * 60_000` is how long a
`queued` row waits before the sweep re-enqueues it. It is longer than the retry delay, so the sweep
never races a scheduled redelivery by design. Racing is still harmless, because of the claim.

**Sweep (R8).** `GenerationsService.sweep() → { enqueued, reclaimed }` runs from the existing
`*/2 * * * *` `scheduled` handler, after `recordings.sweep()`. It re-enqueues `queued` rows older
than `QUEUED_STALE_AFTER_MS` and stale `generating` rows (at most 50, oldest first). It counts the
jobs it **sent**, not the rows it listed, so a queue outage cannot read as success.
`sweepInline({ ignoreStale?: boolean }) → { done, failed, pending }` claims and runs the same rows
directly, without the queue. With `ignoreStale`, it claims every `queued` row whatever its age. The
E2E harness is its only caller.

**Retry** (`GenerationsService.retry(actor, noteId)`): ownership through the note (D018). The claim
is `update … set status='queued', attempt=0, failure=null where note_id=? and status='failed'`, and
no match raises `GenerationNotRetryable`. Then it enqueues, and a failed send is left to the sweep,
as on enqueue.

### 6.5 The output parser (`packages/server/src/Generations/Output.ts`, pure)

The port hands back `{ raw: string; truncated: boolean }`. The prompt asks for one JSON object,
`{"title": string, "notes_markdown": string}`. `parseGeneratedNote(raw, { truncated })` returns
`{ title: string | null; bodyMarkdown: string }` or throws `GeneratedNoteMalformed` /
`GeneratedNoteTruncated`:

1. `truncated` is `GeneratedNoteTruncated` before anything is read. Half a JSON object at the same
   temperature truncates in the same place, so it is terminal.
2. Strip ASCII control characters except `\n` and `\t`, and unwrap one surrounding markdown code
   fence (```` ```json … ``` ```` or a bare ```` ``` ````).
3. `JSON.parse`. A non-object, or `notes_markdown` that is not a string, is malformed. Keys beyond
   the two are ignored.
4. **Title.** Trim it, collapse whitespace, strip surrounding quotes and one trailing period, and
   cut to `GENERATED_TITLE_MAX` at the last word boundary. A missing, non-string or empty title
   gives `title: null`: the note keeps "Untitled note", and that is not a failure.
5. **Body normalisation**, into the phase-4 subset:
   - CRLF becomes LF;
   - `#` and `##` headings become `###`, and `####`+ becomes `###`;
   - `*` and `+` bullets become `-`;
   - a four-space or tab nesting step becomes two spaces, and nesting deeper than one level is flattened to one;
   - trailing whitespace is trimmed on every line, runs of 3+ blank lines collapse to one blank line, and leading and trailing blank lines are dropped;
   - a first heading that repeats the title (case-insensitive) is dropped.
6. An empty body after normalisation is malformed. A body over `NoteBody`'s 100 000 characters is
   malformed.
7. For `brief`, the service keeps only the first paragraph of the parsed body (up to the first
   blank line) before it appends the tip, so an over-eager LLM cannot push a full note under the
   canned tip.

### 6.6 Providers

`packages/server/src/Integrations/Llm/`: `Port.ts`, `LlmFake.ts`, `Llm.test.ts`. There is no
`LlmClient.ts`, because no vendor has been chosen (§10).

```ts
type NoteRequest = {
  readonly attendeeNames: readonly string[];
  readonly key: string;                 // idempotency key, "<generationId>:<attempt>"
  readonly kind: "brief" | "full";
  readonly privateNotes: string;
  readonly startedAt: Timestamp;
  readonly timeoutMs: number;           // LLM_TIMEOUT_MS; a live client aborts at it (LlmTimeout)
  readonly utterances: readonly Utterance[];
};
type LlmPort = { generateNote(request: NoteRequest): Promise<{ raw: string; truncated: boolean }> };
// Errors (R7), packages/domain/src/Llm/Errors.ts:
//   LlmUnavailable 503, LlmRateLimited 429, LlmRejected 422, LlmTimeout 504
// Parser errors, packages/domain/src/Generations/Errors.ts:
//   GeneratedNoteMalformed 502, GeneratedNoteTruncated 502, GenerationNotRetryable 409
```

**`LlmFake`** is deterministic. It is a pure function of the request, never `Math.random`. It records
`calls`, and its mode comes from an injected `readMode(): Promise<"auto" | "hold" | "fail" |
"malformed" | "truncated">`:

- `auto`, `kind: "brief"`: the JSON's title is the first non-blank line of `privateNotes`, trimmed to 60 characters, or else **"Brief check-in"**. `notes_markdown` is **"Not much to transcribe here. The recording captured only a brief greeting with no substantive discussion, decisions, or follow-ups."**, or, with zero utterances, **"Not much to transcribe here. The recording didn’t capture any speech."**. When private notes exist, it appends ` Your typed notes: “<that first line>”.`
- `auto`, `kind: "full"`: the title is the first non-blank line of `privateNotes`, or else one of eight neutral titles picked by a hash of the utterances' text ("Planning sync", "Weekly check-in", "Project review", …). The body is:
  ```
  ### Discussion
  - <first 6 utterances: the first segment's sentence as the bullet>
    - <any further merged sentences of that utterance, up to 2, as nested bullets>

  ### Your notes                 (only when privateNotes has a non-blank line)
  - <each non-blank line, trimmed, up to 10>

  ### Next Steps
  - **Confirm owners for the open items**

    Agree who takes each open question raised in this conversation.

  - **Share these notes with the attendees**

    Send the summary to everyone who was in the meeting.
  ```
  It is wrapped in a ```` ```json ```` fence on purpose, so the parser's unwrap is exercised on every fake run.
- `hold` throws `LlmRateLimited`, so the row goes back to `queued` unspent and waits for the sweep or the harness release. This is how a flow holds "Generating notes...".
- `fail` throws `LlmUnavailable`. Three attempts, then `failed` with `llm_unavailable`.
- `malformed` answers `raw: "not json"` (retried, then `output_malformed`). `truncated` answers `truncated: true` (`output_truncated` at once). No flow uses these two; they are unit-tested.

**Config (R5).** `LLM_MODE` (`fake | live`) is parsed in `Runtime/AppConfig.ts`, in the
`TRANSCRIPTION_MODE` shape. `fake` is the default. `fake` is refused under `NODE_ENV=production`,
and `live` is refused because no client exists. `container.ts` chooses the fake and its `readMode`.
With the harness armed, `readMode` reads `e2e_switches.llm`, and otherwise it is
`async () => "auto"`.

**Queue.** The `GenerationQueue` port (`Generations/GenerationQueue.ts`, type only) is
`{ send(job: { generationId: GenerationId }): Promise<void> }`. The Cloudflare implementation is in
`Runtime/CloudflareGenerationQueue.ts` over the `GENERATION_QUEUE` producer binding, and the
memory implementation is in `Testing/`. `apps/api/src/worker.ts` gains a `queue` handler. It builds
the container, dispatches on `batch.queue` starting with `kothanote-generation`, calls
`generations.run` per message, and maps `done`/`skipped` → `ack()` and `retry` →
`retry({ delaySeconds })`. An unrecognised queue name is logged and `retryAll()`'d, never acked.
`wrangler.jsonc` gains, at the top level **and in every `env` block** (queues are not inherited):

```jsonc
"queues": {
  "producers": [{ "binding": "GENERATION_QUEUE", "queue": "kothanote-generation-<local|dev|prod>" }],
  "consumers": [{ "queue": "kothanote-generation-<local|dev|prod>", "max_batch_size": 1,
                  "max_batch_timeout": 1, "max_retries": 5 }]
}
```

The top-level `-local` queue is simulated by `wrangler dev` and never created. `max_batch_size: 1`
gives each note its own attempt and wall clock. `max_retries` is above `GENERATION_MAX_ATTEMPTS`
because the row, not the queue, counts attempts. `LLM_MODE` is set in every block: `fake` locally
and on dev, and `live` in production, said out loud.

**E2E harness** (behind `E2E_HARNESS`, plain Hono, not in OpenAPI):

- `POST /e2e/llm` `{ mode: "auto" | "hold" | "fail" | "malformed" | "truncated" }` answers 200 `{ mode }`;
- `POST /e2e/llm/release` sets `auto`, calls `generations.sweepInline()`, and returns its counts;
- `POST /e2e/llm/run` `{ times: 1..5 }` leaves the mode alone and runs `sweepInline({ ignoreStale: true })` `times` times. Each pass claims every `queued` row regardless of age and spends one attempt. It is how a flow drives a `fail` job to `failed` without waiting out the retry delay;
- `POST /e2e/transcription/release` (phase 5) also calls `generations.sweepInline()` after `recordings.sweep()`. A flow that releases the transcriber with the LLM in `auto` therefore gets a finished note without depending on local queue timing;
- `POST /e2e/reset` clears the `llm` switch too.

---

## 7. API test cases

`Generations/Generations.test.ts` exercises the service over `makeTestD1()`, `fixedClock`,
`sequentialIds`, `LlmFake`, the memory queue and the phase-5 transcription fake. It reaches
`transcribed` through the real `RecordingsService`, never by writing rows.

1. **Enqueue on settle.** A recording that settles `transcribed` gets exactly one `queued` row, and the memory queue holds one message naming it. A second settle attempt (a sweep after the upload answered) adds no row and no message.
2. **A failed enqueue is survivable.** With the queue scripted to throw, the upload still answers 200 `transcribed`, the row is `queued`, and `sweep()` after `QUEUED_STALE_AFTER_MS` sends it (`enqueued: 1`).
3. **Full note.** A ≥ 60 s recording with private notes "Budget follow-up" runs to `generated`. The note's title is "Budget follow-up". Its body starts `### Discussion`, contains `### Your notes` with `- Budget follow-up` and `### Next Steps` with `- **Confirm owners for the open items**`, and has no code fence.
4. **Full note, no private notes.** The title is one of the fake's neutral titles, the same one on a second run with the same transcript. No `### Your notes` section.
5. **Brief note.** A < 60 s recording (4 words) runs `kind: "brief"` (`fake.calls[0].kind`). The title is "Brief check-in". The body equals the #40 first paragraph + `\n\n` + `LOW_CONTENT_TIP` exactly.
6. **Brief with typed notes.** Title "Budget follow-up". The first paragraph ends ` Your typed notes: “Budget follow-up”.`, and then the tip.
7. **Silence.** The `silent` transcriber (zero utterances) gives the "didn’t capture any speech" paragraph plus the tip.
8. **Idempotent run.** `run` twice on one id makes one LLM call (`fake.calls.length === 1`), and the second returns `skipped`.
9. **A stale claim is reclaimable, and a live one is not.** A row claimed at t0 is `skipped` by `run` at t0 + 1 min, and reclaimed at t0 + `GENERATION_STALE_AFTER_MS` + 1, with `attempt` 2. The first claimant's late write then changes nothing: the latch is on `attempt`.
10. **Hold.** `hold` leaves the row `queued` with `attempt` 0 and returns `done` (acked, not retried). `sweepInline()` while held stays pending. After the switch is set to `auto`, `sweepInline()` generates it.
11. **Retryable failure.** `fail` returns `retry` and leaves `queued` on attempts 1 and 2. Attempt 3 writes `failed` / `llm_unavailable`. The note keeps "Untitled note" and the private-notes fallback body.
12. **Terminal failures.** `truncated` fails at once with `output_truncated` (one call). A scripted `LlmRejected` fails at once with `llm_rejected`.
13. **Malformed.** `malformed` is retried, and then fails with `output_malformed` after 3 calls.
14. **Rename wins.** A note renamed through `NotesService.patch` while `generating` keeps the user's title after `generated`, and the body is still written.
15. **Edited body wins.** A generation retried after the user edited the body (in the failed state) ends `generated` with the user's body untouched and the title filled.
16. **Retry.** `retry` on `failed` sets `queued`, `attempt` 0, `failure` null, and enqueues. It then generates. `retry` on `generated`, or on a note with no generation, raises `GenerationNotRetryable`.
17. **Ownership.** `retry` with another user's note id raises `NoteNotFound`, identical to an absent id, and changes nothing on the other user's row. `GET /notes/{id}` never exposes another user's `generation`.
18. **The read shape.** `NotesService.get` carries `generation` (`status`, `failure`, `updatedAt`) for a recorded note and `null` for a typed one. The list's summary title is the generated title after the run.
19. **Cascades.** Deleting the user removes their generation rows. Discarding a recording (phase 5, only while `recording`) never meets a generation row. Trashing a note keeps its row.
20. **Sweep counts sends.** With the queue throwing, `sweep()` returns `enqueued: 0` over two stale rows.

Other suites:

- `Generations/Output.test.ts`, the parser. The phase exit criterion names these:
  - a plain JSON object; a ```` ```json ```` fence; a bare fence;
  - control characters stripped, with `\n` and `\t` kept;
  - non-JSON, a JSON array, `notes_markdown` missing or not a string, and an empty body after normalisation are all malformed;
  - `truncated: true` is truncated, even with valid JSON;
  - title: trimmed, quotes stripped, trailing period stripped, whitespace collapsed; an 81+ character title cut at a word boundary to ≤ 80; missing or empty gives `null`;
  - headings `#`, `##` and `####` all become `###`; `*`/`+` bullets become `-`; four-space and tab nesting become two spaces; three-level nesting is flattened to two; a title-repeating first heading is dropped; 3+ blank lines collapse;
  - a 100 001-character body is malformed;
  - round-trip: the #31 `markdown-value.txt` excerpt comes back unchanged.
- `Domain/Generation.test.ts`: `isLowContent` at 0, 4, 11, 12 and 16 words, and across several utterances. `NoteGeneration` rejects a `failed` status with a null failure only through the service (the schema is permissive, stated).
- `Integrations/Llm/Llm.test.ts`, the fake:
  - it is deterministic (same request, same raw);
  - `brief` and `full` shapes, parsed through `parseGeneratedNote`;
  - every mode;
  - it records its calls.
- `Notes/Notes.http.test.ts`: `POST /notes/{id}/generation/retry` answers 200 with the `NoteGeneration` shape, 404, 409, and 401 without a session.
- `E2E/E2E.test.ts`: the seed gives the three seeded recordings `generated` rows; `POST /e2e/llm` sets the switch; reset clears it; `llm/release` generates a held row; three `llm/run` passes in `fail` end `failed / llm_unavailable`; `transcription/release` with the LLM in `auto` ends a held recording `generated`.
- `Runtime/AppConfig.test.ts`: `LLM_MODE=fake` is refused under production, `live` is refused, and absent defaults to `fake`.
- `apps/api` `app.test.ts`:
  - the `queue` handler acks a `done` message, retries a `retry` one with the delay, and `retryAll`s an unknown queue name;
  - `scheduled` calls both sweeps;
  - a wrangler-config test asserts every environment has the `GENERATION_QUEUE` producer **and** a consumer of that same queue with `max_batch_size: 1`, and an `LLM_MODE` var.

---

## 8. Acceptance criteria and flows

Every flow starts from `clearState` + `clearKeychain` + reset/seed, and signs in fast as
`e2e-person` through `subflows/open-home.yaml`. The tags are `phase-6` and `regression`. Flows
select by `id`. Text is asserted only as a property of an id, and an id regex
(`"note-block-\d+"`) stands in wherever the block index depends on the fake's output.

New Maestro pieces:

- `scripts/e2e-llm.js` (`MODE`) and `scripts/e2e-llm-release.js` call the §6.6 harness routes;
- `subflows/set-llm.yaml` (`MODE`) and `subflows/release-llm.yaml`;
- `subflows/wait-for-long.yaml` taps `recording-skip-ahead` six times (`repeat: times: 6`), which is at least 60 s of recorded time, so the fake transcriber gives ≥ 4 segments and the note is `full`. It then waits for `recording-end`.

| # | Given / When / Then | Flow |
| --- | --- | --- |
| AC1 | **Given** a signed-in user, the transcriber in `hold` and the LLM in `hold`, **when** they start a recording, type "Budget follow-up" into `recording-notes-input`, pass 60 s (`wait-for-long`) and tap End, **then** `note-status-text` reads "Uploading transcript...". **When** the transcriber is released, **then** `note-status-text` reads "Generating notes...", `note-title` still reads "Untitled note", `note-share` and `note-more` are not visible, and no `note-block-*` is visible (the typed notes are hidden, #106). **When** the LLM is released, **then** `note-status` goes, `note-title` reads "Budget follow-up", `note-block-0` reads "Discussion", a `note-block-\d+` reads "Your notes", one reads "Next Steps" and one reads "Confirm owners for the open items", and Share and More appear. **When** they open More → Edit notes, **then** the editor input starts with "### Discussion". **When** they close it and go back, **then** home's new row reads "Budget follow-up, …". | `apps/native/.maestro/phase-6/generate-notes.yaml` |
| AC2 | **Given** the transcriber and the LLM in `auto`, **when** they record past 10 s (`wait-for-end`) with nothing typed and tap End, **then** within 30 s `note-status` goes, `note-title` reads "Brief check-in", `note-block-0` reads "Not much to transcribe here. The recording captured only a brief greeting with no substantive discussion, decisions, or follow-ups.", `note-block-1` reads "Notes works best with real conversations, meetings, or notes to self. Try recording a call, a catch-up, or even a personal brain dump.", no `note-block-2` exists, and More still offers View transcript. | `apps/native/.maestro/phase-6/short-recording.yaml` |
| AC3 | **Given** the transcriber in `auto` and the LLM in `fail`, **when** they record past 10 s and End, and the harness spends the three attempts (`subflows/run-llm.yaml`, `TIMES: 3`; see note ¹), **then** `note-status-text` reads "Couldn’t generate notes." with `note-status-retry`, `note-title` reads "Untitled note", and `note-share` and `note-more` are visible. **When** they tap Retry and the LLM is released (`release-llm`, which sets `auto` and runs the job inline), **then** within 30 s `note-status` goes and `note-title` reads "Brief check-in". | `apps/native/.maestro/phase-6/generation-failed.yaml` |
| AC4 | **Given** the transcriber in `auto` and the LLM in `hold`, **when** they record past 10 s, End, see "Generating notes...", go back home, and rename the new row to "My own title" through its long-press Edit title, **and** the LLM is released, **then** the note's `note-title` reads "My own title" (the rename wins) and `note-block-0` reads the low-content first paragraph (the body was still written). | `apps/native/.maestro/phase-6/rename-while-generating.yaml` |
| AC5 | **Given** the seeded `not_e2e_launch`, **when** they open it, **then** there is no `note-status` (its generation is `generated`), and the phase-4 body renders as before. Every phase-2..5 flow still passes, with the phase-5 edits below. | `apps/native/.maestro/phase-6/seeded-generated.yaml` (the page only; the seeded `generated` row is proven by `E2E.test.ts`, which the flow cannot tell from no row) |
| AC6 | Phase-5 `record-transcript.yaml` is modified. After the transcriber is released, the flow waits for `note-status` to go (the LLM is in `auto` and the release runs generation inline). The final home assertion reads `"Brief check-in, .*"` instead of `"Untitled note, .*"`. | `apps/native/.maestro/phase-5/record-transcript.yaml` (modified) |
| AC7 | Phase-5 `recording-typing-notes.yaml` is modified. The finished note's `note-title` reads "Budget follow-up", and `note-block-0` matches `Not much to transcribe here\..* Your typed notes: “Budget follow-up”\.` instead of the raw typed line. | `apps/native/.maestro/phase-5/recording-typing-notes.yaml` (modified) |

¹ **How AC3 gets through three attempts without waiting on the queue.** `POST /e2e/llm/release`
always sets `auto`, so it cannot be used here. The flow calls `POST /e2e/llm/run { times: 3 }`
(§6.6) instead. Each pass spends one attempt, and the third pass writes `failed`.

The phase-5 `transcription-failed.yaml` still passes unchanged: after Retry, generation runs in
`auto` and the transcript it opens is unaffected. If its final `note-title` assertion (if any)
reads "Untitled note", change it to "Brief check-in" under AC6's rule.

AC2 is the one flow that goes through the real queue: the upload settles the transcript at once,
the job is enqueued, and `wrangler dev`'s simulated consumer runs it. It is therefore the flow that
proves the producer, the consumer and the handler are wired. The others release the job through
the harness, so they do not depend on local queue timing.

Screenshots for the visual check (`TESTING.md` §8) are `phase-6-generating` (compared with #106),
`phase-6-generated` (#10, taken at the top of the AC1 note), `phase-6-generated-end` (#11, after
scrolling to the last block) and `phase-6-short` (#40 / #107). They are compared by eye before
review.

---

## 9. Designed states no flow reaches

- the retry-failure toast ("Couldn’t retry. Try again."): needs `POST …/generation/retry` to fail on demand;
- `output_malformed` and `output_truncated`: they have the same UI as AC3's failed row, and are unit-tested through the fake's `malformed` and `truncated` modes;
- the finishing transition's animation: Maestro cannot see it, so it is checked by eye;
- the queue's own redelivery path (`retry` with a delay) under `wrangler dev`: the flows go through the harness's inline runs, and `app.test.ts` covers the handler mapping.

They belong to the same scripted-response seam that `BLOCKERS.md` defers for phases 3–5.

---

## 10. Blockers to record

- **No live LLM client.** `LLM_MODE=live` is refused until a vendor is chosen and `LlmClient.ts` exists (a prompt builder, the JSON contract of §6.5, `LLM_TIMEOUT_MS`, and a finish-reason mapping onto `truncated`). Production sets `live` and so fails at startup, alongside `EMAIL_MODE` and `TRANSCRIPTION_MODE`. The stub: `LlmFake` runs everywhere else.
- **The generation queues must exist before a deploy.** `kothanote-generation-dev` and `kothanote-generation-prod` are created by the user (`bunx wrangler queues create …`), not by an agent. `deploy:check` does not prove they exist, and a missing one fails the real deploy.
- **The fake's notes are not the product.** They prove the pipeline, the parser and the rendering. They do not prove note quality, which needs the live client and a hand check (a `docs/DECISIONS.md` verification, as D010–D012).

---

## 11. Task split

### API (packages/domain, packages/server, packages/db, apps/api, packages/apiclient)

1. `packages/domain/src/Domain/Generation.ts`: `GenerationId`, `GenerationStatus`, `GenerationFailure`, `NoteGeneration`, `LOW_CONTENT_TIP`, `LOW_CONTENT_MAX_WORDS`, `GENERATED_TITLE_MAX` and `isLowContent`. Extend `Note` with `generation`. Add `Domain/Generation.test.ts`.
2. `packages/domain/src/Llm/Errors.ts` (`LlmUnavailable` 503, `LlmRateLimited` 429, `LlmRejected` 422, `LlmTimeout` 504) and `Generations/Errors.ts` (`GeneratedNoteMalformed` 502, `GeneratedNoteTruncated` 502, `GenerationNotRetryable` 409). Add `retryNoteGenerationRoute` to `Notes/Contract.ts`.
3. `packages/db`: the `note_generations` schema with its partial index, `db:generate` for the migration, and `RESET_ORDER`.
4. `packages/server/src/Integrations/Llm/`: `Port.ts`, `LlmFake.ts` (deterministic, records calls, five modes through `readMode`) and `Llm.test.ts`.
5. `packages/server/src/Generations/`:
   - `Output.ts` (`parseGeneratedNote`) and `Output.test.ts`;
   - `GenerationQueue.ts` (the port type);
   - `GenerationsRepo.ts`: claim, release, fail, the latched complete batch with its conditional title and body writes, the stale listings, and retry;
   - `Policy.ts`;
   - `GenerationsService.ts`: `run`, `sweep`, `sweepInline`, `retry` and the derived constants;
   - `Http.ts`: the retry route;
   - `Generations.test.ts`.
6. `Recordings`: `stageComplete` stages the `queued` row, and `RecordingsService` gains the `generationQueue` dep and sends after a completed settle (tests 1–2). `NotesRepo`'s detail read joins `note_generations`.
7. `Runtime/CloudflareGenerationQueue.ts`, the memory queue in `Testing/`, `LLM_MODE` in `Runtime/AppConfig.ts` with its refusals, and `GENERATION_QUEUE` in `WorkerEnv.ts`. `container.ts` wires the LLM fake, the queue and `GenerationsService` under `traced()`.
8. `E2E`:
   - the three seeded `generated` rows;
   - the `llm` switch, and clearing it on reset;
   - `POST /e2e/llm`, `/e2e/llm/release` and `/e2e/llm/run`;
   - `transcription/release` also running `sweepInline`.
9. `apps/api`:
   - mount the retry route;
   - add the `queue` handler to `worker.ts`, and the generation sweep to `scheduled`;
   - add `queues` and `LLM_MODE` to the top level and every `env` block of `wrangler.jsonc`, then check `bun run deploy:check`;
   - write the config and handler tests.
10. `packages/apiclient`: `notes.retryGeneration(id)`, and the `Note` type carrying `generation`. A retry invalidates the note and the list.
11. Add the §7 scenario names to `docs/TESTING.md` §4, and the §10 blockers to `docs/plan/BLOCKERS.md`.

### Native (apps/native)

1. `features/recording/status.ts`: `noteStatusRow` takes `generation: NoteGeneration | null`. It adds `{ kind: "generating" }` ("Generating notes...") for `queued`/`generating` once the recording is `transcribed`, and `{ kind: "generationFailed", retry: true }` for `failed`. `isProcessing` is true for `generating`. `shouldPoll` takes both statuses and polls while generation is `queued`/`generating`. Extend `status.test.ts` with every new row and the precedence.
2. `copy.ts`: `NOTE_STATUS_COPY.generating`, `.generationFailed` and `.retryFailed`.
3. `NoteStatus.tsx` and the note page (`app/notes/[id]/index.tsx`):
   - Retry dispatches by row kind: `recordings.retry` for a transcription failure, `notes.retryGeneration` for a generation failure. The retry-failure toast;
   - the page polls through generation;
   - the finishing transition (§3.1);
   - the failed state shows the fallback body and the More menu.
4. Check the phase-4 renderer against #10/#11/#40 at the spacing in §3.2 (heading weight and spacing, the dot and hollow-circle bullets, continuation paragraphs, italics). Fix only what differs, and add a `markdown.test.ts` case for the fake's full-note output.
5. Maestro:
   - add `scripts/e2e-llm.js`, `scripts/e2e-llm-release.js` and `scripts/e2e-llm-run.js` (`TIMES`);
   - add the subflows `set-llm.yaml`, `release-llm.yaml`, `run-llm.yaml` and `wait-for-long.yaml`;
   - write the five `phase-6/*.yaml` flows in §8, and make the AC6/AC7 edits to the phase-5 flows;
   - update `TESTING.md` §8's layout list.
