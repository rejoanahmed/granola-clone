# Blockers

- **Recording UI partly crawled.** One approved throwaway recording captured the mic primer, the live recording card, the keyboard-up mini bar, the More menu and the post-End states (discovery screens #100–#107). Still unseen: pause, the paperclip menu, Minimize, and the new note's transcript sheet and home-list row — those follow #13–14 and #01.
- **First-run onboarding not crawled.** The account is signed in; phase 3 designs its own.
- **Another project's dev stack holds :8081 and :3001 on this machine (phase 2).** `~/personal/eventsbd` runs Metro on :8081 and its API on :3001, which are this app's defaults. A clean launch then loads the wrong bundle, or reaches the other API and reads as signed in. It is not ours to stop. Workaround until the ports are free: run Metro with `EXPO_PUBLIC_SERVER_URL=http://localhost:3002 bunx expo start --dev-client --port 8082` from `apps/native`, and pass `-e DEV_SERVER_URL=http://localhost:8082` to maestro. `subflows/launch-app.yaml` now honours that override: before, its own `env:` default silently won over `-e`. `scripts/maestro.sh` probes and passes whatever `DEV_SERVER_URL` and `API_URL` it is given, so the phase-3 flows run with `DEV_SERVER_URL=http://localhost:8082 API_URL=http://localhost:3002 scripts/maestro.sh`, the API started with `bunx wrangler dev src/worker.ts --local --port 3002 --var API_URL:http://localhost:3002` from `apps/api`.
- **No live email client (phase 3).** Sign-in codes go through the `Email` port, and the only
  implementation is `EmailFake`, which writes each message to the `email_outbox` table (read back by
  `GET /e2e/otp`). `AppConfig` refuses `EMAIL_MODE=fake` under `NODE_ENV=production`, because the
  fake stores plaintext codes, and refuses `EMAIL_MODE=live` because there is no client to select.
  So the `production` env block in `wrangler.jsonc` sets no `EMAIL_MODE` and **a production deploy
  fails every request at startup** until a live client exists. That was already the truth in
  substance: before phase 3, production email sign-in silently logged `provider: "none"` and sent
  nothing. Stubbed: local and the deployed dev Worker run the fake. Unblocked by a phase that picks
  a provider, writes `Integrations/Email/EmailClient.ts`, and adds its credential to `parseConfig`.
- **No trash viewer or purge (phase 4, deferred).** Trash is a soft delete (`notes.trashed_at`),
  and a trashed note can be brought back only through the Undo toast or
  `POST /notes/{id}/restore`. Discovery showed no trash screen, so none is designed. Nothing purges
  a trashed row either: it is kept indefinitely, and `GET /notes/{id}` still returns it with
  `trashedAt`. Stubbed: nothing. The list excludes trashed notes through the partial index
  `notes_owner_live_idx`. Unblocked by a phase that designs a trash screen and a retention period.
  The purge would be a cron calling a service method (R8), and the cascade on `note_attendees`
  already cleans up after it.
- **No live transcription client (phase 5).** Recordings are transcribed through the
  `Transcription` port, and the only implementation is `TranscriptionFake`, which never decodes the
  audio: it answers a deterministic transcript seeded on the recording id and duration. `AppConfig`
  refuses `TRANSCRIPTION_MODE=fake` under `NODE_ENV=production` and refuses `live` because there is
  no client, so production (which sets `live`) fails at startup for this reason as well as
  `EMAIL_MODE`'s. Stubbed: local and the deployed dev Worker run the fake, and the E2E harness's
  `e2e_switches` row scripts it. Unblocked by a phase that picks a vendor, writes
  `Integrations/Transcription/TranscriptionClient.ts` and its webhook route (a `RAW_ROUTE_PREFIXES`
  entry, PROVIDER-FAKES.md rule 8), and adds the credential to `parseConfig`.
- **The R2 buckets must exist before a deploy (phase 5).** `wrangler.jsonc` binds `AUDIO` to
  `gcnotes-audio-dev` and `gcnotes-audio-prod`. They are created by the user
  (`bunx wrangler r2 bucket create gcnotes-audio-dev`, and the same for prod), not by an agent or
  by `deploy.sh`. `bun run deploy:check` resolves the binding but does not prove the bucket exists;
  a missing one fails the real deploy. Stubbed: `wrangler dev --local` simulates the bucket, and the
  audio store fails only the calls that need it when the binding is absent.
- **Audio objects outlive a deleted user (phase 5).** Deleting a user cascades their notes,
  recordings and segments in D1, but nothing deletes the R2 objects under
  `recordings/<ownerId>/`. Discard deletes its own object; nothing else does. Stubbed: nothing.
  Unblocked by a purge (a cron over a service method, R8) that runs with the phase-4 trash purge,
  whenever that lands, and lists the owner's prefix.
- **An abandoned upload never expires (phase 5).** A recording ended on a device that never comes
  back stays `uploading` on the server forever, and one whose app was killed mid-recording stays
  `recording` (the note page shows "This recording didn’t finish."). `sweep()` only polls
  `transcribing` rows. Stubbed: nothing; the note can be trashed. Unblocked by giving the sweep an
  age cutoff that fails such rows, once the client's resume-on-launch has had a release to settle.

## Deferred review items (phase 3)

- **Rendered states no flow reaches.** The boot error screen (`boot-error-screen`, retry, sign
  out), silent sign-out on `ProfileNotFound`, the expired-code and too-many-attempts lines, the
  onboarding save-error lines and the Settings row spinner are designed and built, and
  `welcomeErrorCopy` and `gateFor` are unit-tested. No flow renders them. Each needs a failure the
  flows cannot cause on demand. `GET /me` has to fail for a signed-in user (a 5xx, or a 404 while
  the session is still valid, but deleting the user row cascades the session into a 401). A code
  has to expire (5 minutes of waiting) or be burned by three wrong guesses. A save has to fail.
  The honest seam is a harness switch that scripts the next response of a named route, behind the
  existing `E2E_HARNESS` guard. That is new API surface, so it waits for a phase that needs it for
  more than one screen. The resend countdown, the other state the review named, is now covered by
  `phase-3/sign-in-resend.yaml` (AC10).
- **"Without flashing" is sampled, not proven.** AC2 and AC4 now check for onboarding or welcome
  during the transition as well as after it, but Maestro samples the hierarchy, so a flash shorter
  than one sample can still pass. The spec now says so (§8, AC2). The splash hold is still checked
  by eye in the screenshots.

## Phase 4 native notes

- **`POST /e2e/seed` 500s on a local D1 that already holds `e2e-empty@gcnotes.test` under a
  better-auth id (phase 4) — fixed in review.** `E2eRepo.stageUsers` now deletes a same-email row
  under any other id before inserting the fixed one, so `onConflictDoNothing()` can no longer
  swallow the email conflict. Pinned by "seeds over an address better-auth already signed up under
  another id" in `E2E/E2E.test.ts`.
- **The swipe action's row inset.** `ReanimatedSwipeable` clips its actions to the row, and the
  #03 capsule plus caption (57pt) is taller than the 52pt row, so each row carries half of the 8pt
  row gap inside itself (`ROW_INSET`) and the day header's gaps give it back. The pressed-row fill
  is therefore 60pt tall rather than 52.
- **The gallery's Menu and Toast sections sit after Sheets.** Placed before it, `phase-2/gallery-sheet.yaml`
  could not find `gallery-open-sheet` even while it was on screen, run after the other phase-2
  flows (it passed alone). Moving the new sections below it restored the flow.
  **Cause found in phase 5:** the id was never missing from the tree. `scrollUntilVisible` checks
  only between swipes (~3.5s each on this simulator) and needs the target 100% on screen. The
  palette grew by six tokens, the gallery reached five pages, and `gallery-open-sheet` needed a
  sixth swipe that the 20s timeout expired during, before the check ran; the failure screenshot is
  taken after that last swipe, so it shows the button. `gallery-surfaces` (565pt) had a 247pt
  window in which it was whole, narrower than one swipe, so it was jumped over. The palette is now
  a two-column grid and the fields sit in their own `gallery-fields` section. Keep a scrolled-to
  container well under half a screen tall, and keep the gallery short.
- **`phase-2/home-shell-inert.yaml` failed once in the full phase-2..4 suite (phase 4), not
  reproduced.** Right after its tap on `home-search-button`, the detail for `not_e2e_launch` was
  being pushed. No artefacts of that run survived, so no root cause was found. The review's
  reading was a tap landing while the list laid its rows in under a freshly shown home, so
  `subflows/open-home-as.yaml` now waits for `home-list-loading` to go and for the screen to stop
  moving before a flow touches home. Since then the whole suite (smoke, phase-2, phase-3, phase-4:
  23 flows) passed clean. One earlier full run in the same session lost its last seven flows to the
  Maestro XCTest driver crashing ("Failed to resolve remote element" on a status-bar query, in the
  run's `xctest_runner_*.log`); each of those failed in 1–3 s before touching the app. That is the
  driver, not the app, and the rerun was clean. Watch for the push recurring.

## Deferred review items (phase 4)

- **Designed states no flow reaches.** `home-list-loading`, `home-list-error`/`home-list-retry`,
  `home-list-more`/`home-list-more-retry`, `note-loading`, `note-error`, `note-body-empty`,
  `note-editor-loading`, `note-editor-error`, the editor's and rename's 409/404 close-to-home path
  with its toast, `rename-error`, "Couldn’t move to trash", "Couldn’t restore the note", and the
  share and copy failure toasts are built but unflowed. Each needs a failure (or a delay) the flows
  cannot cause on demand, and the seed holds three notes, so `onEndReached` never pages on device.
  It is the same seam the phase-3 deferral names: a harness switch, behind `E2E_HARNESS`, that
  scripts the next response of a named route, plus a larger fixture for paging. `note-not-found`
  is now covered, by `phase-4/note-not-found.yaml` deep-linking to the trashed `not_e2e_archived`.
- **The #40 italic is asserted by text only.** Maestro reads no font attributes, so
  `open-note.yaml` proves the second paragraph's words and the italic rests on
  `markdown.test.ts` and the screenshot. The pristine-close check in `edit-note-discard.yaml` runs
  straight after the tap; it is kept because a second `notVisible` check follows once
  `note-screen` is back, which is the one that could not pass on a menu that flashed up late.
- **The row menu's horizontal position differs from #02.** It now anchors on the row's content
  frame inside the 20pt gutter, so the lifted preview rests where the row does and the menu's right
  edge sits on the content's right edge (20 in). #02's native menu sat about 90pt in from the right,
  placed from the touch point by UIKit; a drawn menu has no such anchor, and the spec keeps its
  right-aligned rule.
- **`FormRow`'s caret tint (phase 3).** The caret fix (tint applied once focused) was made in the
  note editor and `TextField`. `FormRow` sets its tint at mount the old way; it is not
  autofocused, which is the case that showed blue, so it was left alone.

## Phase 5 native

- **The note page's More menu is drawn inline, not in a native modal.** On a recording's note page,
  opening More, closing it, then tapping Retry (so the status row leaves the page) and opening More
  again brought the menu up visibly but with nothing in the accessibility tree: every Maestro query
  answered an empty hierarchy until it closed. Remounting the modal did not help; drawing the menu as
  the screen's own top layer (`ActionMenu`'s `inline`) did, and `transcription-failed.yaml` passes.
  Home and the live card still use the modal. The root cause (RN `Modal` on iOS 26 after a layout
  change beneath a dismissed one) is not understood; if a second screen hits it, move `ActionMenu`
  to inline everywhere.
- **Sheets with a scroller must make it the screen's root.** react-native-screens sizes a
  `formSheet`'s first-child `ScrollView` to the sheet and, when the scroller is nested, sets its
  frame to the sheet's *window* frame (it ended up 735pt down, 54pt tall). The transcript sheet is
  therefore a root `ScrollView` whose sticky first row is the header, which is how the header stays
  pinned (#14). The sheet root's testID `transcript-sheet` is on that scroller, and
  `transcript-scroll` names the body inside it.
- **`measureInWindow` inside the live card's sheet is sheet-relative.** The live card adds the top
  safe-area inset back when it anchors its More menu (discovery screen 104). A sheet presented at a
  different offset would need the offset measured rather than assumed.
- **The fake recorder writes a bundled one-second tone** (`assets/e2e/sample.m4a`) whatever the
  timer says, so the fake transcriber's duration comes from `POST /recordings/{id}/end`, never from
  the bytes. The real `ExpoAudioRecorder` has not been exercised on a device: the simulator
  microphone cannot be scripted and the physical iPhone is off-limits to agents.
- **Upload-failed, start-failed, interrupted, transcript-empty/-error, and the discard- and
  share-failure toasts** are built and unit-tested (the status-row copy and backoff), and no flow
  reaches them — the scripted-response harness seam the phase-3 and phase-4 entries already defer.
- **End dismisses the card and pushes the note page; it does not cross-fade (phase 5, deliberate).**
  §3.8 first asked for `router.replace` to `/notes/[id]`, which cross-fades as #105 does. The
  replaced page inherited the sheet's presentation, and a second menu opened on it vanished from the
  accessibility tree, so from every flow. `end()` in `record/[id].tsx` now does `back()` then
  `push()`: the sheet slides down, then the page pushes in. The spec records it as a deviation.
  Restoring the cross-fade needs a transition that does not reuse the sheet's presentation.

## Deferred review items (phase 5)

- **Flows still sign in one by one — resolved (e2e-fast-signin).** Every flow still starts from
  `clearState`, a reset and a session of its own, so the suite stays order-independent. What
  changed is how the session arrives: flows that are not about sign-in adopt one the harness minted
  (`subflows/sign-in-fast.yaml`, docs/TESTING.md §8 "Fast sign-in"), and only `phase-3/*` types a
  code. Sharing one sign-in across flows was not needed.
- **"Disabled until `POST /recordings` answers" is not flowed.** The meta pill and Add to folder
  carry `accessibilityState.disabled` until the note exists, but locally the POST answers before
  Maestro's first assertion, so no flow can see the disabled window without the scripted-response
  seam the phase-3 and phase-4 entries already defer. `record-transcript.yaml` now asserts the
  paperclip's disabled state and the owner name in the pill's label.
- **`canReadRecording` and `canEditRecording` share one predicate.** The split is a naming seam for
  sharing (phase-level, not yet designed), and no test pins the two diverging, because nothing
  makes them diverge yet. The test belongs to the phase that adds sharing.
- **The phase-5 review read only part of the E2E module and the error mapping.** A follow-up read
  of `E2eService`, `E2eRepo`, `E2E/Http.ts` and `TranscriptionFake.ts` found no factory
  constructing its own dependency (R3) and no `Env` read outside `container.ts`/`Runtime` (R5).
  `E2eService` throws a plain `Error` for a seeded recording that names no note, which is a fixture
  invariant and a 500 by design. `on-error.ts` maps every `AppError` by its own status, so the new
  `AudioLengthRequired` (411) and `AudioLengthMismatch` (400) need no case there.
- **A job-less row whose audio never arrived waits 30 minutes, then goes back to `uploading`.** The
  sweep resubmits a stranded `transcribing` row after 5 minutes when its object is stored, and
  releases it only after 30 when it is not, so a slow 100 MB put is never cut off mid-stream. If the
  client has already given up by then, the row joins the abandoned-upload entry above.

## Phase 6 API

- **No live LLM client.** No vendor has been chosen, so there is no `LlmClient.ts` (a prompt
  builder, the JSON contract of phase-6.md §6.5, `LLM_TIMEOUT_MS`, and a finish-reason mapping onto
  `truncated`). `LLM_MODE=live` is refused at startup until it exists, and production sets `live`,
  so production fails at startup alongside `EMAIL_MODE` and `TRANSCRIPTION_MODE`. The stub:
  `LlmFake` runs everywhere else. The fake's notes prove the pipeline, the parser and the renderer,
  not note quality, which needs the live client and a hand check.
- **The generation queues must exist before a deploy.** `gcnotes-generation-dev` and
  `gcnotes-generation-prod` are created by the user (`bunx wrangler queues create …`), never by an
  agent. `deploy:check` does not prove they exist, and a missing one fails the real deploy. The
  top-level `gcnotes-generation-local` is simulated by `wrangler dev` and never created.

## Deferred review items (phase 6)

- **Full phase-2..6 regression run.** The review fix pass ran only the flows its changes touch: the
  five phase-6 flows and the two edited phase-5 flows (`record-transcript`, `recording-typing-notes`),
  all passing on 2026-09-25, which closes the "never ran" half of the finding for AC6 and AC7. The
  whole-suite run AC5 asks for is the final gate's job, run once.
- **Retry's in-flight spinner is not asserted.** `generation-failed.yaml` now waits for "Generating
  notes..." between Retry and `release-llm`, but not for the spinner replacing Retry while the POST
  is in flight: against a local API that window is a few milliseconds, and a Maestro wait on it
  would be a race rather than a check. It belongs in a component test of `NoteStatus` with `busy`.
- **The real queue consumer is not paused in the harness-driven flows.** `generation-failed.yaml`
  now asserts `output.llmRun.failed === 1` instead of assuming each pass spent one attempt, which
  holds whether or not `wrangler dev`'s consumer spent attempt 1 itself. A harness switch that
  pauses the consumer would make the accounting exact, at the cost of a test-only branch in the
  queue handler; not worth it while the assertion covers both orders.
- **An edit to the fallback body while generating is covered by a unit test, not a flow.** The
  page hides the body while generating, so no flow can reach it; `Generations.test.ts` "keeps a body
  edited while generating" pins the user-wins rule through the service.

## Phase 7 API

- **No live LLM for chat.** `streamAnswer` and `titleChat` exist only in `LlmFake`. A live client
  needs a prompt that emits `[k]` markers from the numbered context, a streaming transport, and a
  real model list behind the `ChatModelId` ids; the model list is fake by design, with neutral
  names. The stub: the fake runs everywhere, under the phase-6 `LLM_MODE`, and `live` is still
  refused at startup.
- **Retrieval is keyword scoring, not semantic.** `searchTerms` and `scoreNote` are enough to prove
  scoping and ownership and to drive the UI; a real product would embed the notes. Recorded, not
  built.
- **Person scope has an interim entry.** The attendees-sheet row opens person chat until phase 8's
  person page (#65) exists and takes over the entry through its Ask pill (phase-7.md §3.7).
- **Streaming on device relies on `expo/fetch`.** React Native's global `fetch` exposes no response
  body stream on iOS, so `askChat` takes the fetch as a parameter and native passes `expo/fetch`.
  If it does not stream through a dev build, the stub is to read the whole body at `done` and render
  it at once: the UI's states are unchanged and only the token-by-token growth is lost. Record it
  here if that happens.
- **The turn write is ordered, not atomic.** `ChatsService` takes no `UnitOfWork` (its deps are
  `{ clock, ids, llm, logger, repo }`), so `ChatsRepo.writeTurn` writes the thread, then both
  messages in one statement, then the thread's clock. A failure between the first two leaves an
  empty thread in history (preview ""), never a message without its thread. A concurrent send into
  the same thread loses on the unique `(thread_id, position)` and answers `ChatBusy`.
- **A `name:` person key is matched on `lower(trim(name))` in SQL.** `personKeyOf` also collapses
  inner whitespace, which SQLite cannot express without a function; a stored name with a double
  space is not found under its key. Attendees with an address (every seeded one) use `email:`.
- **A client that disconnects mid-answer relies on the request staying alive.** The service runs
  the answer detached from its reader and `pipe` drains it without writing, so the answer is stored
  as long as the Worker keeps the request's promise. If the runtime cancels it after the client
  goes, the row stays `streaming`, reads as `failed` after two minutes, and Retry recovers it. No
  `waitUntil` is wired: the handler has no seam for it without Hono reaching the service.
- **`traced()` spans `Llm.streamAnswer` for the call only, not the stream.** The wrapper ends a span
  when a function returns a non-promise, so the span measures creating the iterator; the answer's
  duration is visible only through the `chat.answer.*` log events.
- **`expo/fetch` streams through the dev build.** The answer grows token by token on the iPhone 17
  Pro simulator, so the whole-body fallback above was not needed.
- **A quick swipe on a row read as a tap (native, found in phase 7).** With React Native's
  `Pressable` as the swipeable's child, Maestro's 400 ms swipe opened the note or the thread instead
  of revealing the trailing actions: `phase-4/trash-by-swipe.yaml` failed the same way on the
  pre-phase-7 tree, and Chat History's rows inside their sheet failed every time. Both rows now use
  react-native-gesture-handler's `Pressable`, which yields to the swipe, and the history sheet has
  its own `GestureHandlerRootView` because a formSheet is outside the app root's.
- **Citation chips cannot be inline views (native).** iOS makes a paragraph one accessibility
  element and drops every view nested in it from the tree, attachments included, so an inline chip
  was invisible to VoiceOver and to Maestro. `BlockText` lifts a block's `[k]` markers out of its
  text, reserves their room at the end of its last line (`onTextLayout`) and draws the chips over it
  as siblings. The cost: a marker in the middle of a block is drawn at the block's end.
- **Toasts from the chat modal and Chat History.** The root `ToastProvider` draws under any native
  presentation, so the global chat route and the history sheet each wrap their own provider. A
  `FullWindowOverlay` was tried first and lost phase 4's "Moved to trash" toast after a pop.
- **Chat History and Activity keep a decoy scroller.** Both need a fixed header (and History a
  docked search) around their list, so the list cannot be the sheet's root as the transcript's is.
  react-native-screens resized the list to the whole sheet anyway and drew the rows over the
  header, so each route renders `SheetScrollDecoy`, an empty inert `ScrollView`, as its first
  child: the frame correction lands on it and the real list keeps its layout.

## Deferred review items (phase 7)

- **SQL case folding is ASCII only.** `personKeyOf` lowercases with JavaScript's full Unicode
  `toLowerCase`, while the attendee match (`personMatches` in `@gc/db` since phase 8) and retrieval's LIKE prefilter
  (`mentionsAny`, `containing`) compare against SQLite's `lower()`, which folds only A–Z. A `name:`
  key for an attendee with no address and a non-ASCII capital ("Élodie") is not found, so person
  Ask answers `PersonNotFound`, and a non-ASCII question term misses a note that capitalises it.
  The fix is a normalised column written at insert time (`note_attendees.name_key`, and a folded
  search text on notes and segments), which is a migration plus a backfill, or matching in the
  repository in JavaScript over the owner's attendees. Every seeded attendee has an address, and
  `email:` keys are ASCII in practice. What was fixed: `personKeyOf` no longer returns the invalid
  `name:` for an attendee with neither an address nor a name; it answers `null`, and the attendees
  sheet leaves that row inert.
- **The dimmed home barely peeks above the global chat sheet.** The route is a native page sheet,
  so the peek and its dimming are UIKit's; the home's `#262626` header dims to near the status bar's
  black, which is why the strip above the card reads as dark rather than as the home (#70). The
  grabber #70 draws is now drawn in the sheet (`chat-grabber`).
- **The soft-keyboard half of "a thread from history does not autofocus" is not asserted.** The
  screen now dismisses the keyboard when history loads a thread, but the simulator runs with a
  hardware keyboard, so no flow can see the software keys stay down.
- **The pin layout animation is not asserted.** `LayoutAnimation` moves the row into or out of
  Pinned; no flow can observe an animation.

## Phase 8 API

- **Search is substring, not ranked or full-text.** `instr(lower(…), q)` over one owner's live notes
  is enough for a personal corpus and for proving scoping. An FTS5 table (with ranking, and snippets,
  which discovery does not show) is a later change behind the same route.
- **Case folding is ASCII-only for meetings.** SQLite's `lower` does not fold `É`, so "émile" does
  not find a note titled "Émile". The People section no longer has this limit: it matches in
  JavaScript over the owner's attendee rows (see the review items below). The fix is FTS5 with `unicode61`, or a lower-cased shadow column written by the
  repository. The phase-7 entry on person keys is the same limit.
- **Transcripts are not searched.** Discovery's copy scopes search to "title, notes, or people".
  Chat retrieval (phase 7) does read transcripts. Recorded, not built.
- **Search results are capped, not paged** (8 people, 50 meetings). A `nextCursor` can be added to
  `SearchResults` without breaking clients.
- **No avatars.** People get an initial (phase-8.md §3.3) until an avatar source exists (a calendar
  provider in phase 11, or an uploaded profile photo).

## Phase 8 native

- **Designed states no flow reaches.** `search-loading`, `search-error`, `person-loading`,
  `person-error`, `person-list-more` / `person-list-more-retry`, `person-not-found` and the name-only
  person header (spec §9) need a response the harness cannot script: a held or failing `/search`
  or `/people`, a second page that fails, or a guest with no address in the seed. They belong to the
  scripted-response harness seam deferred above. What stands in: `features/search/viewState.test.ts`
  and `features/people/viewState.test.ts` cover the state selection (including the new "resolves
  with no notes" → not found), and the People and Search API tests cover the name-only person. None
  of these states is proven on device.
- **The keyboard toggle's label follows focus, not keyboard visibility.** "Hide keyboard" /
  "Show keyboard" is driven by the input's focus, which is the only thing on the page that raises
  the keyboard. On a simulator with a hardware keyboard attached, AC1 would therefore pass with no
  software keyboard on screen, so it proves "the input autofocused". On this simulator the software
  keyboard does show (the `phase-8-search-empty` screenshot); driving the label from
  keyboard-controller's visibility would make AC1 fail on a hardware-keyboard simulator instead.
  Accepted.

## Deferred review items (phase 8)

- **A positive search wait can be satisfied by an intermediate prefix query.** `inputText` types
  character by character and `keepPreviousData` holds the last answer, so a wait for a row can match
  the answer to "fo" before "forty" lands. Only AC5 is pinned, by the echoed query. Exposing the
  settled query on screen for Maestro needs an element that is either visible (a design deviation)
  or a hidden accessibility node (noise for VoiceOver). In practice XCUITest types a word well
  inside the 250 ms debounce, so one request is sent. Recorded, not built.
- **`personMatches` in `@gc/db` is not `personKeyOf`.** SQL `lower()` folds only A–Z and the
  whitespace collapse folds only tab, LF, CR and space, so a `name:` key for "Élodie" (or a name
  holding a non-breaking space) opens a person page that says "isn't in your notes anymore", and
  `/notes?person=` is empty. Search's People section already matches in JavaScript. Fixing the other
  three callers (people, the notes filter, chat scope) means selecting the owner's attendee rows,
  comparing `personKeyOf(row) === key`, and passing the note ids back as one bound
  `json_each(?)` parameter, because D1 caps bound parameters at 100. That reshapes three repos and
  the notes keyset query, and it moves `personKeyOf` below `@gc/db`. It is not a local fix. Deferred
  with the phase-7 entry on person keys.
- **People and Search tests seed through the E2E harness via `buildContainer`.** `Notes.test.ts`'s
  person cases now seed through `NotesService.create`. A shared fixture helper for the others would
  have to build the E2E repo, and `scripts/check-architecture.mjs` forbids importing a repo as a
  value outside `container.ts` and a `*.test.ts`. Left as is.

## Phase 9 (folders)

- **Folders never sync.** #50's empty-state copy promises folders "appear here after they are
  synced", and there is no desktop app. The string is kept verbatim, as COPY.md requires. A later
  wording change is a copy decision, not a code change.
- **No rename.** Discovery shows no rename entry. `PATCH /folders/{id}` can be added with the same
  `folderNameKey` uniqueness rule, and the drawer row menu is where it would go. Not built.
- **The live recording card's Add to folder (#102) stays inert.** The note exists by then, so the
  same sheet could open over the card, but presenting a modal over the `fullScreenModal` recording
  route while audio is capturing needs its own device check. Deferred to phase 12's parity pass.
- **Recording from a folder view does not file the note.** A new note lands in My notes only;
  `RecordingsService.start` answers `folderIds: []`. Auto-filing is a guess about intent that
  discovery cannot settle.
- **The folder list is capped at 100 (`FOLDERS_PER_OWNER_MAX`) and not paged.** A `nextCursor` can
  be added to `FolderList` without breaking clients.
- **The drawer's home "push" is a dim, not a translate.** #50's shot shows home at its normal x,
  although the discovery README says "pushed". Recorded for the parity pass.
