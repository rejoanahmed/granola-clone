# Phase 5 — Recording and transcript

The lime **+** FAB on home starts a recording. The user can type private notes while it runs, pause
it, minimise it, cancel it in the first seconds, or discard it. **End** uploads the audio. A fake
transcriber turns it into speaker-grouped utterances, and the transcript opens from the note's More
menu in the #13–14 sheet. The AI title and body belong to phase 6. In this phase a finished
recording's note keeps the title "Untitled note", and its body is the notes the user typed.

Discovery covers the mic primer, the live card, the keyboard mini bar, the More menu and the
post-End page (#100–#107), plus the transcript sheet (#13, #14, #42). Pause, Minimize, the
paperclip, the denied-permission state, every failure and a multi-speaker transcript were **never
seen**. This spec designs them in the same visual language and marks each one *(designed)*.

Screens: `#NN` is `~/personal/granola-clone-discovery/screens/NN-*/`. Tokens are from the discovery
README and the phase-2 `design/tokens.ts`.

---

## 1. Scope

| In | Out (and where it goes) |
| --- | --- |
| Mic primer (#100), system mic alert (#101), denied card *(designed)* | Paperclip attachments: the button is drawn but disabled (photo attachments are out of scope) |
| Live recording card (#102): timer, level meter, pause *(designed)*, Cancel → End | "Generating notes...", AI title and AI body: phase 6 |
| Keyboard mini bar (#103) | Add to folder on the live card: drawn, inert until phase 9 (same as phase 4) |
| More → Discard note (#104) | Attendee editing on the live card: the pill opens the phase-4 attendees sheet read-only |
| Minimize, and the home pill that resumes it *(designed)* | Transcript editing, speaker renaming, timestamps, audio playback (none seen, #13) |
| Post-End note page with the "Uploading transcript..." status row (#105) | Live transcription vendor (blocker, §10) |
| Transcript sheet (#13, #14, #42), with the More → View transcript entry (#12) | Phone call and Watch recording |
| API: recordings, audio upload, transcripts, fake transcriber, sweep cron | Live transcription while recording (transcription runs after End) |

---

## 2. Journey

```
home (+ FAB)
  ├─ mic undetermined ─▶ primer card (#100) ─ Continue ─▶ iOS alert (#101) ─ Allow ─▶ live card
  │                                         └ Close ─▶ home (no note)          └ Don’t Allow ─▶ denied card
  ├─ mic denied ───────▶ denied card (designed) ─ Open Settings / Close ─▶ home (no note)
  └─ mic granted ──────▶ live card (#102)
                            ├─ Cancel (first 10 s) ─▶ home, note gone
                            ├─ ••• → Discard note ─▶ confirm ─▶ home, note gone
                            ├─ chevron-down ─▶ home with the recording pill ─ tap ─▶ live card
                            └─ End (after 10 s) ─▶ note page, "Uploading transcript..." (#105)
                                                     └─▶ finished note ─ ••• → View transcript ─▶ #13
```

---

## 3. Screens and states

The layout numbers below are iOS points on the 428pt discovery device. The clone runs at 402pt,
so horizontal measurements are relative to the 20pt phase-2 gutter, not absolute.

### 3.1 Mic primer card (#100) — `mic-primer-card`

Shown **only when mic permission is undetermined** (`getRecordingPermissionsAsync().status ===
"undetermined"`). No note exists yet.

- Home stays visible behind a dim scrim (`mic-primer-scrim`, black at 50%). Tapping the scrim closes the card, the same as Close.
- The card floats above the home indicator. Horizontal inset 22 on the 428pt device, so the card fills the width minus the gutter. Radius 40, fill `#1A1A1A`, 1px border `#333333`. It slides up from the bottom and slides back down when it closes.
- Top right: a Close glyph (`x`, 17pt, `#A8AAA1`). `mic-primer-close`, a11y "Close", 44pt hit area.
- Centred: an `AudioLines`/waveform glyph, 40pt, `#8A8A8A`.
- A heading in the serif display face, ~34pt, centred, `#FCFDF8`, wrapping to 3 lines: **"Enable your microphone to start transcribing"** (`mic-primer-title`).
- A full-width light pill, 56pt tall, fill `#EAEBE4`, black semibold 17pt text: **"Continue"** (`mic-primer-continue`). 24pt bottom padding.
- **Continue** calls `requestRecordingPermissionsAsync()`. The card closes when the iOS alert appears. **Allow** opens the live card straight away, with no second tap (#101). **Don’t Allow** shows the denied card (§3.2).
- **Close** returns to home, with no request sent and no note created.

### 3.2 Mic denied card — `mic-denied-card` *(designed)*

Shown when permission is `denied`, whether from the FAB or straight after Don’t Allow. It uses the
same chrome as §3.1: scrim `mic-denied-scrim`, Close `mic-denied-close`, the same card.

- Glyph: `MicOff`, 40pt, `#8A8A8A`.
- A serif heading, centred: **"Microphone access is off"** (`mic-denied-title`).
- A secondary line, 17pt, `#A8AAA1`, centred: **"Turn on the microphone for Notes in Settings to start transcribing."**
- A light pill: **"Open Settings"** (`mic-denied-settings`). It calls `Linking.openSettings()` and closes the card.
- No note is created. Going back to the app with permission now granted and tapping the FAB again goes straight to the live card.

### 3.3 iOS microphone alert (#101)

The system owns this alert, so it has no testID. The copy comes from `NSMicrophoneUsageDescription`,
set through the `expo-audio` config plugin's `microphonePermission`:

- Title (iOS writes it): **"“Notes” would like to access the Microphone."**
- Purpose string: **"Notes needs microphone access to transcribe your meeting"**
- Buttons: **Don’t Allow** · **Allow**

### 3.4 Live recording card (#102) — `recording-screen`

A **full-height card sheet** presented modally over a dimmed home: route `/record/[id]`,
`presentation: "modal"`. Top radius 40, fill `#2A2A2A`, and a status-bar strip of `#1B1B1B` above
it. The recording starts the moment the card appears. `POST /recordings` runs at the same time
(§6.1), and the note id arrives with its response.

Top to bottom:

1. **Minimize** (`recording-minimize`, a11y "Minimize note"): a 44pt circular icon button top left, fill `#1E1E1E`, border `#333`, chevron-down glyph. See §3.7.
2. **Capsule** top right, 100×44, fill `#1E1E1E`, border `#333`:
   - paperclip (`recording-attach`, a11y "Add attachment"), **disabled**: glyph at 40% opacity, `accessibilityState.disabled`, and a tap does nothing;
   - ••• (`recording-more`, a11y "More"), which opens §3.6.
3. **Title** (`recording-title`): **"Untitled note"**, serif ~40pt, placeholder grey `#A8AAA1`. It is not editable here.
4. **Metadata row**: the phase-4 pill (`recording-meta-pill`, border only, fully rounded) holds **"Today 1:25 PM"** (the start time, format `Today h:mm a`) and a people glyph with **"+1"**. The a11y label is `"Today 1:25 PM, <owner name>"`. Tapping it opens the phase-4 attendees sheet. Next to it is a circular outline **Add to folder** button (`recording-add-to-folder`, a11y "Add to folder"), inert until phase 9. Both are **disabled until `POST /recordings` answers**, because nothing exists to open before then.
5. **Private notes** (`recording-notes-input`, a11y "Private notes"): a multiline plain-text field, 17pt `#FCFDF8`, with the placeholder **"Write notes here..."** in `#A8AAA1`. It has no formatting toolbar and fills the rest of the card. It autosaves 800ms after the last keystroke, and again on End, Minimize and backgrounding (`PATCH /recordings/{id}`).
6. **Recording bar** (`recording-bar`): 64pt tall, fully rounded, lime `#B2C248`, inset 24 from the card edges, 24pt above the home indicator.
   - Left: a 56pt circle, fill `#656E2D`, with a pale-lime (`#E5EACC`) pause glyph (two bars): `recording-pause`, a11y "Pause recording". While paused it shows a play triangle and the a11y label is "Resume recording".
   - Centre: a 5-bar **level meter** (`recording-meter`, dark `#262626` bars 3pt wide, heights driven by metering at ~10 Hz, clamped to 4–16pt), followed by a monospaced timer (`recording-timer`), ~27pt, dark `#1A1A1A`. The timer shows `mm:ss`, and `h:mm:ss` from one hour. It counts recorded time, so paused time is excluded.
   - Right: a light pill, fill `#EAEBE4`, dark 17pt text. It reads **"Cancel"** (`recording-cancel`) while the recorded time is under **10 s**, then **"End"** (`recording-end`). Only one of the two ids exists at a time. The 10 s threshold is our choice: #102 shows Cancel at 00:02 and End by 00:15.
7. **Paused** *(designed)*: the meter is replaced by the word **"Paused"** (`recording-paused`, 17pt semibold, `#1A1A1A`), and the timer holds its value. The bar keeps its colour. Cancel/End still work while paused.

**States**

| State | What shows | testIDs |
| --- | --- | --- |
| Starting (recorder not yet running) | The card with the timer at `00:00`, a flat meter, and Cancel | `recording-screen` |
| Recording | As above, live | `recording-timer`, `recording-meter` |
| Paused *(designed)* | "Paused" in place of the meter, play glyph | `recording-paused` |
| Keyboard up (#103) | §3.5 | `recording-mini-pill` |
| Start failed *(designed)* | The bar is replaced by an error row (below). The recorder is stopped and any note that was created is discarded | `recording-error`, `recording-error-close` |

The **start-failed** state covers the recorder failing to start and `POST /recordings` failing. It
shows a full-width pill row where the bar was: fill `#333333`, radius 24, with a `#FE4346`
alert-circle glyph and **"Couldn’t start recording."**. Beside it is a light **"Close"** pill
(`recording-error-close`), which dismisses the card to home. No flow reaches this state (§9).

### 3.5 Keyboard mini bar (#103) — `recording-mini-pill`

When the notes field is focused and the keyboard is up, the full bar collapses. Two controls dock
8pt above the keyboard:

- left: a compact lime pill (`recording-mini-pill`), ~125×48, fill `#B2C248`, holding the level meter and the timer at ~22pt. It has no pause and no Cancel/End. Tapping it dismisses the keyboard;
- right: a 48pt circular **keyboard-dismiss** button (`recording-keyboard-dismiss`, a11y "Hide keyboard"), fill `#2A2A2A`, border `#333`, with the `keyboard.chevron.compact.down` glyph (lucide `KeyboardOff`).

Dismissing the keyboard brings the full bar back. The mini pill keeps counting.

### 3.6 Recording More menu (#104) — `recording-menu`

The phase-2 `ActionMenu`, anchored under the capsule and right-aligned, dark blurred material, radius
26. It has one destructive item: a red trash glyph with **"Discard note"** (`recording-menu-discard`),
coloured `#FE4346`. Tapping outside the menu (`action-menu-scrim`) closes it.

**Discard note** opens a system confirm alert *(designed; #104 was never tapped)*:

- Title **"Discard this note?"**, message **"The recording and your notes will be deleted."**
- Buttons **Cancel** · **Discard** (destructive).
- **Discard** stops the recorder, deletes the local audio file, calls `DELETE /recordings/{id}`,
  dismisses the card to home and shows the toast **"Note discarded"**. There is no Undo: this is a
  hard delete, deliberately unlike Move to trash, because a discarded recording has nothing worth
  bringing back.

**Cancel** on the bar does the same thing **without** the confirm, and without a toast. The window
is under 10 s, so there is nothing to lose. If `POST /recordings` has not answered yet, Cancel waits
for it and then deletes. If the delete itself fails, the note would show up on home as a stray
"Untitled note", so the client retries the delete once. If the retry also fails, the toast
**"Couldn’t discard the note"** appears.

### 3.7 Minimise and resume *(designed)*

Minimize dismisses the card. The recording keeps running, including with the app in the
background: the `UIBackgroundModes: audio` flag is set through the expo-audio plugin, because #102's
timer kept running with the app backgrounded. Home then shows:

- a **home recording pill** (`home-recording-pill`, a11y "Return to recording"): the §3.5 mini pill (lime, meter and timer), placed in the bottom bar **in place of the + FAB** at the same 64pt height. The Ask pill shrinks to make room. Tapping it reopens the live card with its state intact: timer, notes and paused state. The FAB comes back once the recording ends or is discarded, so only one recording can be live at a time.
- the new note's **row** in today's group, titled "Untitled note". While the recording is live, its 44pt tile shows a lime `#B0BF40` waveform glyph instead of the phone glyph, and its a11y label gains ", recording" ("Untitled note, 1:25 PM, recording"), which is how a flow sees the tile inside the row's one accessibility element. Tapping the row reopens the live card, just like the pill.

### 3.8 Post-End note page (#105) — the phase-4 `note-screen`

**End** stops the recorder, sends `POST /recordings/{id}/end` with the recorded duration, then
uploads the audio (`PUT /recordings/{id}/audio`). The card becomes the ordinary note page:
the sheet is dismissed and `/notes/[id]` is pushed *(a deliberate deviation from #105's cross-fade:
`router.replace` swapped the page in with the sheet's presentation, and a second menu opened on it
left the accessibility tree; see BLOCKERS.md)*. The phase-4 detail gains
one row and two conditions:

- **Status row** (`note-status`), between the metadata row and the body: full width, fill `#333333`, radius 24, 48pt tall. It holds a small spinner (`#8A8A8A`) and grey 17pt text (`note-status-text`). The text reads **"Uploading transcript..."** while the client is uploading **or** the server status is `uploading`/`transcribing`. (Phase 6 adds "Generating notes..." after that.) The body below is hidden while the row shows. As #106 notes, the typed line is not shown during processing.
- **Title**: while the row shows and the title is still the default, it is drawn in the placeholder grey `#A8AAA1`. Otherwise it keeps the phase-4 colour.
- **Share and More are hidden** while the row shows (#105 has only Back). The Ask pill stays.
- The page polls `GET /notes/{id}` every 2 s while `recording.status` is `uploading` or `transcribing`, and stops when the page loses focus.

**States** (all on `note-screen`):

| State | Status row | Rest of page |
| --- | --- | --- |
| Uploading / transcribing (#105) | spinner + "Uploading transcript..." | title grey, no Share/More, body hidden |
| Upload failed *(designed)* | `#FE4346` alert glyph + **"Couldn’t upload the recording."** + an inline **"Retry"** text button (`note-status-retry`) | as above |
| Transcription failed *(designed)* | alert glyph + **"Couldn’t transcribe this recording."** + **"Retry"** (`note-status-retry`) → `POST /recordings/{id}/retry` | Share/More appear. More has **no** View transcript |
| Interrupted *(designed)* — status `recording` but no live recorder on this device (app killed mid-recording) | alert glyph + **"This recording didn’t finish."**, no retry | Share/More appear. More → Move to trash is the way out |
| Finished — status `transcribed` | none | Share/More appear. Body = the typed private notes rendered as markdown, or the phase-4 `note-body-empty` state when nothing was typed |

**Upload retry.** The local audio file is kept until `PUT …/audio` answers 200. The client retries a
failed upload three times with 1 s / 3 s / 9 s backoff, then shows the upload-failed row, and
`note-status-retry` starts the cycle again. The file lives in the app's document directory under
`recordings/<recordingId>.m4a`, so an upload can resume after a relaunch: on launch, the client
re-uploads any file whose recording still reads `uploading`.

### 3.9 More menu with View transcript (#12)

The phase-4 menu gains **"View transcript"** (`note-menu-transcript`, lucide `FileText` glyph)
between Edit notes and Copy notes, which is the #12 order: **Edit notes · View transcript · Copy
notes · Move to trash**. It appears **only when `note.recording?.status === "transcribed"`**. A note
without a recording has no transcript to view (the seeded `not_e2e_standup`), and no entry leads to
an empty sheet.

### 3.10 Transcript sheet (#13, #14, #42) — `transcript-sheet`

Route `/notes/[id]/transcript`, presented as a large sheet with the phase-4 attendees-sheet chrome:
bg `#262626`, top radius 40, the parent dimmed behind it. Swipe-down dismisses it.

- **Header, pinned** while the body scrolls (#14):
  - a serif heading **"Transcript"**, ~34pt (`transcript-title`);
  - a grey subtitle, 17pt `#A8AAA1`, wrapping to 2 lines: **"Review or share the full meeting transcript."**;
  - top right, two 46pt circular buttons, fill `#262626`, border `#333`: **share** (`transcript-share`, a11y "Share transcript", `square.and.arrow.up` / lucide `Share`) and **close** (`transcript-close`, a11y "Close", `x`).
- **Body** (`transcript-scroll`): one block per **utterance**, meaning consecutive segments by the same speaker merged into one (`transcript-utterance-<index>`, from 0):
  - a 44pt circular avatar with a dark `#1A1A1A` initial, 20pt semibold: the speaker letter (`transcript-avatar-<index>`);
  - to the right, starting at x78: the speaker name **"Speaker A"** (~20pt, `#FCFDF8`), then the text (~17pt, `#E8E8E3`, line height 24), left-aligned. `transcript-speaker-<index>` and `transcript-text-<index>`;
  - 24pt between blocks. There are no timestamps, no per-sentence splitting and no renaming UI.
  - Avatar colours by speaker: **A `#E4CD75`** (seen). Only A was ever seen, so B `#8EBCEC`, C `#ADC06F`, D `#E78BCE`, then cycling, are *(designed)*, drawn from the discovery palette.
  - The last block is followed by a `transcript-end` marker, which is what a flow scrolls to.
- **Share** opens the iOS share sheet with plain text: one paragraph per utterance, `Speaker A: <text>`, separated by blank lines and headed by the note title. If sharing fails, the toast **"Couldn’t share the transcript"** appears.

**States**

| State | What shows | testID |
| --- | --- | --- |
| Loading | header plus three grey skeleton blocks (avatar circle and two lines) | `transcript-loading` |
| Populated | utterances | `transcript-utterance-*` |
| Empty *(designed)* — transcribed, zero segments (silence) | centred secondary text **"No speech was detected in this recording."** | `transcript-empty` |
| Error *(designed)* | **"Couldn’t load the transcript."** + a light **"Retry"** pill | `transcript-error`, `transcript-retry` |
| Gone — 404 `TranscriptNotFound`/`NoteNotFound` | the sheet closes, and the toast **"This transcript isn’t available"** appears | — |

### 3.11 Home changes

- **FAB** (`home-new-note-button`, a11y "New note") decides by permission status: undetermined → primer, denied → denied card, granted → live card. While a recording is live, the FAB is replaced by `home-recording-pill` (§3.7).
- A tap while the permission check is still running is ignored, so a double tap cannot start two recordings.
- The row of a note whose recording is live shows the lime waveform tile. Every other row is unchanged.
- The list refetches when the live card or the post-End page is dismissed, so the new row appears without a pull-to-refresh.

---

## 4. Copy

Every string is verbatim from COPY.md, with the product name replaced by Notes, or marked
*(designed)*.

| Where | String |
| --- | --- |
| Primer | Enable your microphone to start transcribing · Continue · A11y: Close |
| System alert | “Notes” would like to access the Microphone. · Notes needs microphone access to transcribe your meeting · Don’t Allow · Allow |
| Denied *(designed)* | Microphone access is off · Turn on the microphone for Notes in Settings to start transcribing. · Open Settings |
| Live card | Untitled note · Today 1:25 PM · +1 · Write notes here... · 00:02 (timer) · Cancel · End · A11y: Minimize note · Add to folder · Private notes · More · Add attachment |
| Pause *(designed)* | Paused · A11y: Pause recording · Resume recording |
| Mini bar | A11y: Hide keyboard |
| More | Discard note |
| Discard confirm *(designed)* | Discard this note? · The recording and your notes will be deleted. · Cancel · Discard |
| Toasts *(designed)* | Note discarded · Couldn’t discard the note · Couldn’t share the transcript · This transcript isn’t available |
| Start failed *(designed)* | Couldn’t start recording. · Close |
| Home pill *(designed)* | A11y: Return to recording |
| Status row | Uploading transcript... (seen) · Couldn’t upload the recording. · Couldn’t transcribe this recording. · This recording didn’t finish. · Retry *(designed)* |
| More | Edit notes · View transcript · Copy notes · Move to trash |
| Transcript | Transcript · Review or share the full meeting transcript. · Speaker A · A11y: Share transcript · Close |
| Transcript states *(designed)* | No speech was detected in this recording. · Couldn’t load the transcript. · Retry |

The copy lives in `apps/native/src/features/recording/copy.ts` and `features/notes/copy` next to the
phase-4 `NOTE_COPY`, so each flow asserts by id and the unit tests assert by string.

---

## 5. testIDs

| Screen | testIDs |
| --- | --- |
| Primer | `mic-primer-card`, `mic-primer-scrim`, `mic-primer-close`, `mic-primer-title`, `mic-primer-continue` |
| Denied | `mic-denied-card`, `mic-denied-scrim`, `mic-denied-close`, `mic-denied-title`, `mic-denied-settings` |
| Live card | `recording-screen`, `recording-minimize`, `recording-attach`, `recording-more`, `recording-title`, `recording-meta-pill`, `recording-add-to-folder`, `recording-notes-input`, `recording-bar`, `recording-pause`, `recording-meter`, `recording-paused`, `recording-timer`, `recording-cancel`, `recording-end`, `recording-error`, `recording-error-close` |
| Mini bar | `recording-mini-pill`, `recording-keyboard-dismiss` |
| More | `recording-menu`, `recording-menu-discard` (the phase-2 `action-menu-scrim` closes it) |
| Home | `home-recording-pill`, plus the existing `home-new-note-button` and `home-note-<id>` |
| Note page | `note-status`, `note-status-text`, `note-status-retry`, `note-menu-transcript`, plus the phase-4 ids |
| Transcript | `transcript-sheet`, `transcript-title`, `transcript-share`, `transcript-close`, `transcript-scroll`, `transcript-loading`, `transcript-empty`, `transcript-error`, `transcript-retry`, `transcript-utterance-<i>`, `transcript-avatar-<i>`, `transcript-speaker-<i>`, `transcript-text-<i>`, `transcript-end` |
| Toast | the phase-2 `toast`, `toast-message` |

---

## 6. API

Every route is authenticated and owner-scoped. Another user's recording or note is a **404**
identical to an absent one (D018). Timestamps are epoch ms (D003).

### 6.1 Endpoints

| Route | Body | Success | Errors |
| --- | --- | --- | --- |
| `POST /recordings` — `createRecordingRoute` | `{ startedAt?: Timestamp }` (strict) | **201** `{ note: Note, recording: Recording }`. Creates the note (title "Untitled note", source `phone`, the owner as attendee 0, `startedAt` = the body's value or now) and a recording with status `recording` | 401, 422 |
| `GET /recordings/{id}` — `getRecordingRoute` | — | 200 `Recording` | 404 `RecordingNotFound` |
| `PATCH /recordings/{id}` — `patchRecordingRoute` | `{ privateNotes: string ≤ 100 000 }` (strict) | 200 `Recording` | 404, 409 `RecordingNotActive` (status is not `recording`), 422 |
| `DELETE /recordings/{id}` — `discardRecordingRoute` | — | **204**. Hard-deletes the note, the recording, its segments and its audio object | 404, 409 `RecordingNotActive` |
| `POST /recordings/{id}/end` — `endRecordingRoute` | `{ durationMs: int 0..21 600 000 }` (strict) | 200 `Recording`, status `uploading`, `endedAt` = now. The same body replayed on an `uploading` row is a 200 no-op | 404, 409 `RecordingNotActive`, 422 |
| `PUT /recordings/{id}/audio` — `uploadRecordingAudioRoute` | raw bytes, `Content-Type` one of `audio/mp4`, `audio/m4a`, `audio/x-m4a`, `audio/aac`, `audio/wav` | 200 `Recording`. Stores the object, then submits it to the transcriber with idempotency key = recording id (a retry's attempt *n* uses `<id>:<n>`, so it is a new job rather than the failed one). The status becomes `transcribing`, or `transcribed` when the provider answers at once, or `failed`. A replay on `transcribing`/`transcribed` is a 200 no-op that neither re-stores nor re-submits | 404, 409 `RecordingNotUploading` (still `recording`), 400 `AudioLengthMismatch` (the body did not match its `Content-Length`), 411 `AudioLengthRequired` (no usable `Content-Length`), 413 `AudioTooLarge` (> 100 MB), 415 `UnsupportedAudioType`, 422 `EmptyAudio` |
| `POST /recordings/{id}/retry` — `retryRecordingRoute` | — | 200 `Recording`. Re-submits the stored audio. The status becomes `transcribing`/`transcribed`/`failed` | 404, 409 `RecordingNotRetryable` (status is not `failed`) |
| `GET /notes/{id}/transcript` — `getNoteTranscriptRoute` (in the Notes contract, served by the Recordings service) | — | 200 `Transcript` | 404 `NoteNotFound`, 404 `TranscriptNotFound` (no recording, or not yet `transcribed`) |

`PUT …/audio` is a normal authenticated route, **not** a `RAW_ROUTE_PREFIXES` entry: raw routes
skip the session lookup, and this route needs the session. The handler passes
`c.req.raw.body` (a web `ReadableStream`), the content type and `Content-Length` to the service in
one expression (R6). The service never sees Hono. A missing (411) or oversized (413) `Content-Length` is
rejected before anything is read; a body that ends short of it or runs past it is a 400 and
releases the claim, so the client's retry is taken.

### 6.2 Shapes (`packages/domain/src/Domain/Recording.ts`)

```ts
RecordingId = branded("RecordingId", "rec_")
RecordingStatus = z.enum(["recording", "uploading", "transcribing", "transcribed", "failed"])
RecordingFailure = z.enum(["transcription_unavailable", "transcription_rejected", "transcription_timeout"])
SpeakerLetter = z.string().regex(/^[A-Z]$/)

Recording = z.object({
  createdAt: Timestamp,
  durationMs: z.number().int().min(0).nullable(),   // null until End
  endedAt: Timestamp.nullable(),
  failure: RecordingFailure.nullable(),              // non-null iff status = failed
  id: RecordingId,
  noteId: NoteId,
  privateNotes: z.string(),
  startedAt: Timestamp,
  status: RecordingStatus,
  updatedAt: Timestamp,
})

// On the Note detail, so the page needs one fetch to choose its status row and its menu.
NoteRecording = z.object({ durationMs, id: RecordingId, status: RecordingStatus })
Note        += { recording: NoteRecording.nullable() }
NoteSummary += { recordingStatus: RecordingStatus.nullable() }   // the live tile on home

Utterance = z.object({ endMs: int, speaker: SpeakerLetter, startMs: int, text: z.string().min(1) })
Transcript = z.object({ noteId: NoteId, recordingId: RecordingId, utterances: z.array(Utterance) })

// Pure and exported, so the service and its test share one definition: consecutive segments from
// the same speaker become one utterance (texts joined by a space, startMs of the first, endMs of the
// last).
groupUtterances(segments: readonly Segment[]): Utterance[]
```

The native app derives "Speaker A" from the letter, so the label is never stored.

### 6.3 Storage (`packages/db`)

- `recordings`: `audio_key` text null, `created_at`, `duration_ms` int null, `ended_at` int null, `failure` text null, `id` pk, `note_id` text **unique** → `notes.id` on delete cascade, `owner_id` → `user.id` cascade, `private_notes` text not null default "", `provider_job_id` text null, `attempt` int not null default 0 (retries, migration `0004`), `started_at`, `status` text not null, `updated_at`. Index `recordings_transcribing_idx` on (`status`, `updated_at`) where status = 'transcribing', for the sweep. There is one recording per note (the unique constraint).
- `transcript_segments`: `end_ms`, `id` pk (`seg_`), `position` int, `recording_id` → `recordings.id` cascade, `speaker` text, `start_ms`, `text`. Unique (`recording_id`, `position`). Segments are stored raw. Grouping happens at read time, so a later speaker-rename phase edits segments, not merged blobs.
- `e2e_switches`: `name` text pk, `value` text. It is only written by the harness.
- Keys inside each `sqliteTable` are alphabetical. `RESET_ORDER` gains `transcriptSegments`, `recordings` (both before `notes`) and `e2eSwitches`.
- Audio goes to R2, binding `AUDIO`, key `recordings/<ownerId>/<recordingId>`. The bucket binding is added to the top-level and **every** `env` block of `apps/api/wrangler.jsonc`.

### 6.4 Providers and the sweep

- `packages/server/src/Integrations/Transcription/`: `Port.ts`, `TranscriptionFake.ts`, `Transcription.test.ts`. No `TranscriptionClient.ts` yet, because no vendor has been chosen (§10). The port:
  ```ts
  type TranscriptionPort = {
    submit(input: { key: string; audio: AudioRef; durationMs: number }):
      Promise<{ status: "done"; segments: Segment[] } | { status: "pending"; jobId: string }>;
    poll(jobId: string): Promise<same union>;
  };
  // Errors (R7): TranscriptionUnavailable 503, TranscriptionRateLimited 429,
  //              TranscriptionRejected 422, TranscriptionTimeout 504
  ```
- **The fake is deterministic.** It seeds on `key` and `durationMs`, never `Math.random`. It never decodes the audio.
  - Under 60 s: one segment, speaker A, **"Hello. How are you?"** (#42).
  - From 60 s: `ceil(durationMs / 15 000)` segments that alternate A/B in runs chosen from the seed. The text is drawn from a fixed corpus of neutral sentences.
  - It records `calls`, and honours the key, so a second `submit` with the same key returns the same answer and adds no work.
  - Its mode comes from an injected `readMode(): Promise<"auto" | "hold" | "fail" | "silent">`:
    - `hold` answers `pending` to both `submit` and `poll`;
    - `fail` throws `TranscriptionUnavailable`;
    - `silent` answers `done` with zero segments.
- `container.ts` is where the mode is decided (R5). `TRANSCRIPTION_MODE` is parsed in `Runtime/AppConfig.ts`, and follows the `EMAIL_MODE` shape:
  - `fake` is refused under `NODE_ENV=production`;
  - `live` is refused, because no client exists yet.
  - When the E2E harness is armed, `readMode` reads `e2e_switches.transcription`. Otherwise it is `async () => "auto"`.
- `AudioStore` port (`Recordings/AudioStore.ts` type, with the R2 implementation in `Runtime/`). It has `put(key, stream, contentType)`, `delete(key)` and `ref(key)`. The unit tests get an in-memory implementation.
- **Sweep (R8).** `RecordingsService.sweep()` polls every `transcribing` row that has a `provider_job_id`, completes it (writes the segments, sets `transcribed`) or fails it, and returns `{ completed, failed, pending }`. It runs from a new `scheduled` handler in `apps/api` on `*/2 * * * *`, with the trigger in every env block. It is idempotent: completing claims the row with `UPDATE … WHERE status = 'transcribing' AND provider_job_id = <the job it polled>`, so two overlapping sweeps cannot both write segments, and a sweep holding an earlier attempt's job cannot settle the current attempt. After the polls it recovers `transcribing` rows with **no** job id (a Worker that died between the upload's claim and the vendor's answer, or a rate-limited submit) once they are over 5 minutes old: a stored object is resubmitted under the same key, and a missing one is released back to `uploading` after 30 minutes.
- **E2E harness** (behind the existing `E2E_HARNESS` guard, plain Hono, not in OpenAPI):
  - `POST /e2e/transcription` `{ mode }` → 200 `{ mode }`;
  - `POST /e2e/transcription/release` sets `auto`, then calls `recordings.sweep()`, and returns its counts.
  - `POST /e2e/reset` clears the switch.
  - `POST /e2e/seed` gives `not_e2e_launch` a transcribed recording with a **two-speaker** transcript of at least 8 utterances, long enough to scroll (A/B/A/B…, first utterance by A). It gives `not_e2e_solo` a transcribed recording with one utterance, A, "Hello. How are you?" (#42). It gives `not_e2e_other` a transcribed recording, for the ownership tests. `not_e2e_standup` has none.

---

## 7. API test cases

`Recordings/Recordings.test.ts` exercises the service over `makeTestD1()`, `fixedClock`,
`sequentialIds`, the transcription fake and the memory audio store.

1. `create` makes a note titled "Untitled note" with source `phone`, the owner as the sole attendee, and a recording with status `recording`, `durationMs` null and `privateNotes` "".
2. `create` honours a supplied `startedAt`. Without one, it uses the clock.
3. `patch` saves `privateNotes` while `recording`, and raises `RecordingNotActive` on an `uploading` row.
4. `discard` on `recording` deletes the note, the recording and the audio object, so `GET /notes/{id}` answers `NoteNotFound`. On `transcribed`, it raises `RecordingNotActive`.
5. `end` sets `uploading`, `durationMs` and `endedAt`. A replay on `uploading` is a no-op. `end` on `transcribed` raises `RecordingNotActive`.
6. `uploadAudio` before `end` raises `RecordingNotUploading`.
7. `uploadAudio` with the fake in `auto` stores the object, calls `submit` once with key = the recording id, and ends `transcribed` with segments.
8. A replayed `uploadAudio` on `transcribed` neither stores nor submits again (`fake.calls.length === 1`).
9. The fake in `hold` leaves the row at `transcribing` with a job id. `sweep()` while it is still held leaves it pending. After the switch goes to `auto`, `sweep()` completes it, and a second `sweep()` completes nothing.
10. The fake in `fail` leaves the row `failed` with `transcription_unavailable`. `retry` with the fake back in `auto` ends `transcribed`. `retry` on `transcribed` raises `RecordingNotRetryable`.
11. `silent` ends `transcribed` with zero segments, and `transcript` returns `utterances: []`.
12. `transcript` groups consecutive speakers: segments A, A, B, A come back as three utterances, and the first joins both texts.
13. `transcript` for a note without a recording, or one still `transcribing`, raises `TranscriptNotFound`.
14. **Ownership.** For every operation (`get`, `patch`, `discard`, `end`, `uploadAudio`, `retry`, `transcript`), another user's id raises the same not-found error as an absent id, and nothing changes on the other user's rows.
15. The notes list and detail carry `recordingStatus` and `recording`. A note with no recording carries `null`.
16. Cascades: deleting the user removes their recordings and segments. Trashing a note keeps its transcript readable.

Other suites:

- `Recordings/Recordings.http.test.ts` checks the wire shape once per route: 201 on create, 204 on discard, the 413, 415 and 422 audio rejections, and a missing session answering 401.
- `Domain/Recording.test.ts` checks `groupUtterances` edge cases (empty list, a single segment, all one speaker) and that the strict bodies reject unknown keys.
- `Integrations/Transcription/Transcription.test.ts` checks the fake:
  - it is deterministic: same key and duration give identical segments;
  - under 60 s it gives the one-utterance answer;
  - over 60 s it alternates A/B;
  - every mode behaves as described;
  - it records its calls.
- `E2E/E2E.test.ts` checks that the seed gives `not_e2e_launch` ≥ 8 utterances across A and B, that `solo` gives exactly "Hello. How are you?", that reset clears the switch, and that `release` completes a held recording.
- `Runtime/AppConfig.test.ts` checks that `TRANSCRIPTION_MODE=fake` is refused under production, `live` is refused, and an absent value defaults to `fake`.
- `apps/api` `app.test.ts` checks that the `scheduled` handler calls `sweep` over the real container.

---

## 8. Acceptance criteria and flows

Every flow starts from `clearState` + `clearKeychain` + reset/seed (`subflows/open-home.yaml` signs
in as `e2e-person`). The tags are `phase-5` and `regression`. Flows select by `id`. The one exception
is the iOS system alerts (the mic prompt and the discard confirm), which have no ids and are tapped
by text.

**Mic permission in flows.** Maestro's `launchApp` grants every permission by default.
`subflows/launch-app.yaml` gains a `MIC` parameter (`allow` | `deny` | `unset`), defaulted in the
expression rather than in `env:`, for the reason that file already records. It is passed as
`permissions: { microphone: ${MIC} }`. `open-home-as.yaml` and `open-home.yaml` pass it through.

**The recorder in flows.** A simulator mic cannot be scripted, so a Debug build with
`EXPO_PUBLIC_RECORDER=fake` (the Maestro default in `config.dev.ts`) uses `FakeRecorder`:

- the timer comes from the injected clock;
- it can **skip ahead**: the live card then draws an invisible 16pt control in its top-left corner,
  `recording-skip-ahead`, that adds 10 s of recorded time, and `subflows/wait-for-end.yaml` taps it
  rather than waiting ten real seconds for End. The real recorder has no skip, so the control is
  never drawn in a build that records the microphone;
- the meter follows a deterministic sine;
- on stop, it writes a bundled one-second `assets/e2e/sample.m4a` to the recording's path.

The **permission check stays real** (expo-audio's own calls), and that is what makes the primer and
deny flows honest.

New scripts: `.maestro/scripts/e2e-transcription.js` (`MODE`) and `e2e-release.js` call the harness
routes in §6.4.

| # | Given / When / Then | Flow |
| --- | --- | --- |
| AC1 | **Given** a signed-in user with the mic allowed and the transcriber held, **when** they tap + and wait until the bar shows End (at 10 s), **then** `recording-screen` shows "Untitled note", the meta pill, "Write notes here...", the timer and End. **When** they tap End, **then** `note-screen` shows `note-status` reading "Uploading transcript...", with no `note-share` and no `note-more`. **When** the transcriber is released, **then** the status row goes, Share and More appear, More shows `note-menu-transcript`, and the transcript sheet shows `transcript-speaker-0` "Speaker A" and `transcript-text-0` "Hello. How are you?". **When** they close it and go back, **then** home lists the new "Untitled note" row in today's group. | `apps/native/.maestro/phase-5/record-transcript.yaml` |
| AC2 | **Given** a live recording under 10 s, **when** they tap `recording-cancel`, **then** home shows again with `home-new-note-button` and no new row (the seeded rows only). | `apps/native/.maestro/phase-5/cancel-recording.yaml` |
| AC3 | **Given** the mic is denied, **when** they tap +, **then** `mic-denied-card` shows "Microphone access is off" and `mic-denied-settings`, and no `recording-screen` appears. **When** they tap `mic-denied-close`, **then** home shows with no new row. | `apps/native/.maestro/phase-5/mic-denied.yaml` |
| AC4 | **Given** the mic is undetermined, **when** they tap + then `mic-primer-close`, **then** home shows with no request made and no new row. **When** they tap + then Continue and Allow on the system alert, **then** `recording-screen` appears with no further tap. (It then Cancels, to leave nothing behind.) | `apps/native/.maestro/phase-5/mic-primer.yaml` |
| AC5 | **Given** the mic is undetermined, **when** they tap +, Continue, then **Don’t Allow**, **then** `mic-denied-card` appears. | `apps/native/.maestro/phase-5/mic-primer-deny.yaml` |
| AC6 | **Given** a live recording past 10 s, **when** they open `recording-more`, **then** `recording-menu` holds only `recording-menu-discard`. **When** they tap it and confirm Discard, **then** home shows the toast "Note discarded" and no new row. | `apps/native/.maestro/phase-5/discard-recording.yaml` |
| AC7 | **Given** a live recording, **when** they tap `recording-notes-input` and type "Budget follow-up", **then** `recording-mini-pill` and `recording-keyboard-dismiss` show and `recording-bar` does not. **When** they tap dismiss, **then** `recording-bar` returns. **When** they End and the transcriber is in auto, **then** the finished note's body reads "Budget follow-up". | `apps/native/.maestro/phase-5/recording-typing-notes.yaml` |
| AC8 | **Given** a live recording, **when** they tap `recording-pause`, **then** `recording-paused` shows and `recording-meter` does not. **When** they tap it again, **then** the meter returns and `recording-paused` goes. | `apps/native/.maestro/phase-5/pause-resume.yaml` |
| AC9 | **Given** a live recording, **when** they tap `recording-minimize`, **then** home shows `home-recording-pill` in place of `home-new-note-button`, and an "Untitled note" row. **When** they tap the pill, **then** `recording-screen` returns with the notes they typed still in the field. **When** they Cancel or End, **then** the FAB returns. | `apps/native/.maestro/phase-5/minimize-resume.yaml` |
| AC10 | **Given** the seeded `not_e2e_launch`, **when** they open More → View transcript, **then** `transcript-sheet` shows "Transcript", the subtitle, `transcript-share`, `transcript-close`, `transcript-speaker-0` "Speaker A" and `transcript-speaker-1` "Speaker B". **When** they scroll to `transcript-end`, **then** `transcript-title` and `transcript-close` are still visible (the header is pinned, #14). **When** they tap close, **then** `note-screen` shows. **And** `not_e2e_standup`'s More has no `note-menu-transcript`. | `apps/native/.maestro/phase-5/transcript-seeded.yaml` |
| AC11 | **Given** the transcriber set to fail, **when** they record past 10 s and End, **then** `note-status-text` reads "Couldn’t transcribe this recording." with `note-status-retry`, and More has no View transcript. **When** the switch is set to auto and they tap Retry, **then** the status row goes and View transcript opens "Hello. How are you?". | `apps/native/.maestro/phase-5/transcription-failed.yaml` |
| AC12 | The phase-4 `open-note.yaml` changes: `not_e2e_launch` now has a transcript, so its More asserts `note-menu-transcript` **visible**, and the #12 order holds. Every phase-2..4 flow still passes. | `apps/native/.maestro/phase-4/open-note.yaml` (modified) |

The screenshots taken for the §8 visual check are `phase-5-primer` (against #100),
`phase-5-recording` (#102), `phase-5-typing` (#103), `phase-5-more` (#104), `phase-5-uploading`
(#105) and `phase-5-transcript` (#13). They are compared by eye before review, as `TESTING.md` §8
describes.

---

## 9. Designed states no flow reaches

These are built and unit-tested, and no flow reaches them, for the reason each one gives:

- **start-failed:** needs the recorder, or `POST /recordings`, to fail on demand;
- **upload-failed** and its retry: needs the network to fail mid-upload;
- **interrupted:** needs the app killed mid-recording, with the file then lost;
- **transcript-empty:** reachable through `silent` if a flow is wanted; it is unit-tested instead;
- **transcript-error:** needs `GET …/transcript` to fail;
- the "Couldn’t discard the note" toast;
- the share failure toast.

They belong to the same scripted-response harness seam that `BLOCKERS.md` already defers for phases
3 and 4.

---

## 10. Blockers to record

- **No live transcription client.** `TRANSCRIPTION_MODE=live` is refused until a vendor is chosen and `TranscriptionClient.ts` and its webhook route exist. Production fails at startup for this reason as well as `EMAIL_MODE`'s. The stub: the fake runs everywhere else.
- **R2 buckets must exist before a deploy.** `kothanote-audio-dev` and `kothanote-audio-prod` are created by the user (`wrangler r2 bucket create`), not by an agent. `deploy:check` does not prove they exist.
- **Audio objects outlive a deleted user.** The D1 cascade removes the rows, and nothing deletes the R2 objects. The fix is a purge that runs with the phase-4 trash purge, whenever that lands.
- **An abandoned upload stays `uploading` on the server** if the device never comes back. The sweep does not expire such rows yet.

---

## 11. Task split

### API (packages/domain, packages/server, packages/db, apps/api, packages/apiclient)

1. `packages/domain/src/Domain/Recording.ts`: the ids, status, failure, `Recording`, `Utterance`, `Transcript` and `groupUtterances`. Extend `Note`/`NoteSummary` with `recording`/`recordingStatus`. Tests in `Domain/Recording.test.ts`.
2. `packages/domain/src/Recordings/Contract.ts` with the seven routes in §6.1, plus `getNoteTranscriptRoute` in `Notes/Contract.ts`. `Recordings/Errors.ts`: `RecordingNotFound` 404, `RecordingNotActive` 409, `RecordingNotUploading` 409, `RecordingNotRetryable` 409, `AudioTooLarge` 413, `UnsupportedAudioType` 415, `EmptyAudio` 422, `TranscriptNotFound` 404. Add the transcription error classes.
3. `packages/db`: the `recordings`, `transcript_segments` and `e2e_switches` schemas, `db:generate` for the migration, and the `RESET_ORDER` entries.
4. `packages/server/src/Integrations/Transcription/`: `Port.ts`, `TranscriptionFake.ts` (deterministic, records calls, four modes via `readMode`), `Transcription.test.ts`.
5. The `AudioStore` port, with the R2 implementation in `Runtime/` and a memory implementation for tests.
6. `Recordings/RecordingsRepo.ts` (claim-style status updates), `Policy.ts`, `RecordingsService.ts` (create, get, patch, discard, end, uploadAudio, retry, transcript, sweep), `Http.ts`. Extend `NotesRepo` so its reads carry the recording status.
7. `container.ts`: wire the service, the fake and the audio store under `traced()`. `Runtime/AppConfig.ts` gains `TRANSCRIPTION_MODE`, with its refusals.
8. `E2E`: `POST /e2e/transcription` and `/e2e/transcription/release`, the seeded transcripts (§6.4), and the switch cleared on reset.
9. `apps/api`: mount the router and add the OpenAPI tag, add the `scheduled` handler calling `sweep`, and put the R2 `AUDIO` binding, the `TRANSCRIPTION_MODE` var and the cron trigger in the top level and every `env` block of `wrangler.jsonc`. Check `bun run deploy:check`.
10. `packages/apiclient`: `recordings.ts` (create, get, patch, discard, end, uploadAudio taking a `BodyInit` plus content type, retry), `notes.transcript`, query keys and invalidation (a recording change invalidates the note and the list).
11. The tests in §7. Add the new scenario names to `docs/TESTING.md` §4, and the §10 blockers to `docs/plan/BLOCKERS.md`.

### Native (apps/native)

1. Add `expo-audio` (and `expo-file-system` if it is not present) at exact Expo-owned `~` versions. The `app.json` plugin gets `microphonePermission: "Notes needs microphone access to transcribe your meeting"` and background recording. This needs a native rebuild (`bun run e2e:ios`).
2. `src/features/recording/`:
   - a `Recorder` port with `ExpoAudioRecorder` (m4a, metering on) and `FakeRecorder` (clock, sine meter, bundled `assets/e2e/sample.m4a`), selected by `EXPO_PUBLIC_RECORDER` in `src/config`;
   - a `permissions.ts` wrapper over expo-audio;
   - `copy.ts`;
   - a `useLiveRecording` store (one live recording app-wide: status, elapsed, paused, notes, recording id);
   - an upload queue with retry, backoff and resume on launch;
   - `format.ts`: the `mm:ss`/`h:mm:ss` timer and the Cancel/End threshold, with unit tests.
3. The mic primer card and the denied card (§3.1–3.2), as one `MicCard` component over the phase-2 sheet chrome.
4. The `/record/[id]` modal route: the live card (§3.4), pause, Cancel/End, the start-failed state, the keyboard mini bar (§3.5), the More menu with Discard and its confirm (§3.6), and the notes autosave.
5. Home: the FAB decides by permission, the `home-recording-pill` replaces the FAB while live, the row gets the lime tile while live, and the list refetches on return (§3.7, §3.11).
6. The note detail: the `note-status` row and its states, the grey placeholder title, Share and More hidden while processing, polling, and `note-menu-transcript` in #12 order (§3.8–3.9).
7. The `/notes/[id]/transcript` sheet: the pinned header, the utterance blocks, the avatar colours, share, and the loading/empty/error/gone states (§3.10).
8. Maestro:
   - add the `MIC` parameter to `launch-app.yaml`, and pass it through `open-home-as.yaml` and `open-home.yaml`;
   - add `scripts/e2e-transcription.js` and `scripts/e2e-release.js`;
   - add the subflows `start-recording.yaml` (tap + and wait for `recording-screen`) and `wait-for-end.yaml` (tap `recording-skip-ahead`, then `extendedWaitUntil recording-end`, 5 s);
   - write the eleven `phase-5/*.yaml` flows in §8 and update `phase-4/open-note.yaml` (AC12);
   - update `TESTING.md` §8's layout list.
9. Unit tests (vitest) for the timer format, the upload backoff, the choice of status-row copy, the utterance colour cycle and the transcript share text.
