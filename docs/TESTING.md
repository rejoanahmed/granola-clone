# Testing

The architecture exists so that the interesting rules can be tested in milliseconds with no
deployed infrastructure — no `wrangler dev`, no remote D1, no container. This file is how that is
done, what must be covered by name, and where the honesty boundary is — the things a local suite
cannot prove and which therefore have to be checked against real infrastructure.

Three layers run in this repository's own process, and the proportions are deliberate:

| Layer | Where | How many | What it proves |
| --- | --- | --- | --- |
| **Service tests** | `packages/server/src/<Plural>/<Plural>.test.ts` | most of the suite | Every business rule and every error — against the real repositories and the real schema |
| **Wire-shape tests** | `packages/server/src/<Plural>/<Plural>.http.test.ts` | one per context | The router mounts, validates and serialises as the contract says |
| **Pure unit tests** | `packages/domain/src/Errors.test.ts`, `Runtime/UnitOfWork.test.ts`, `Runtime/traced.test.ts`, `FeatureFlags.test.ts` | one per pure module | Arithmetic, boundaries, fail-closed behaviour |

`packages/apiclient/src/client.test.ts` belongs to the middle row — same wire-shape budget, read
from the client's side against a recording `fetch` stub. `apps/native` ships the jest harness
(`jest.config.js`, `test/setup.ts`) and no unit suite; its UI is exercised by Maestro (§8).

There is a fourth layer, and it is deliberately outside that table because it does not run here:
`packages/e2e` walks its journeys over HTTP against the **deployed** dev Worker, and a green run is
what promotes a merge to production. It answers the one question none of the three rows can — does
a *deploy* work — and §6 is its specification.

`Testing/Database.test.ts` is none of the three: it tests the **harness** the first row runs on —
that the real migration applies, that `meta.changes` is per statement, that `batch()` rolls back,
that unique indexes and foreign keys bite. A harness whose fidelity is assumed is a second model of
D1 wearing a better disguise, so it gets its own suite (§2, §5).

---

## 1. The setup

```ts
// vitest.config.ts — packages/domain, packages/server and apps/api
export default { test: { environment: "node", globals: false, include: ["src/**/*.test.ts"] } };
```

`globals: false` is not pedantry: it forces every test file to carry
`import { describe, expect, it } from "vitest"`, which is what makes a test file readable in
isolation and what stops a stray `test()` from a different runner compiling by accident.

`packages/apiclient` runs under `bun test`; `packages/domain`, `packages/server` and `apps/api` run
under vitest. **Whichever runner a package uses, it must be scoped to `src`** — `bun test src` for
the first, `include: ["src/**/*.test.ts"]` in the vitest config for the rest. Every one of these
packages emits a `dist` (they are `composite`, so `tsc -b` writes one), and an unscoped run
discovers the built copies too: every suite runs twice, which reads as "everything passes" right up
until a stale `dist` makes it read as "everything fails".

This is also why the repo's test gate is `bun run test` (turbo, per-package configs) and not a bare
`bun test` at the root. Bare `bun test` walks the whole tree — gitignored `dist/` included — and it
has none of the per-package vitest setup, so it cannot provide the `cloudflare:workers` stub that
`packages/server` and `apps/api` need. It will fail, and the failure says nothing about your code.

---

## 2. Service tests — the real repositories, over a real SQLite

No `wrangler dev`, no mocking library, and — since **D016** — no hand-written repository doubles.
What replaces them is one file: `packages/server/src/Testing/Database.ts`. `makeTestD1()` applies
every statement of `packages/db/d1-migrations/*.sql` — the same files `wrangler d1 migrations apply`
sends to production — to a `better-sqlite3` `:memory:` database, turns foreign keys on, and hands
back a `D1Database` facade. `seedD1(d1, tables)` writes fixture rows as one atomic batch, in the
order given, in **database** column names. The migrations are read off disk, so a checkout that has
never run `bun run db:generate` fails every service test at once — with that instruction as the
error message, rather than with a hundred "no such table".

On top of it the test builds the repositories that ship:

```ts
// packages/server/src/Profiles/Profiles.test.ts, abridged
let d1: TestD1;
beforeEach(() => { d1 = makeTestD1(); });   // one migrated, empty database per test
afterEach(() => { d1.close(); });           // closed after it, so the run does not leak handles

const service = () =>
  makeProfilesService({ repo: makeProfilesRepo(makeDrizzle(d1)) });

it("answers the caller's own row, in epoch milliseconds", async () => {
  await seedD1(d1, [{ rows: [userRow(actor()), userRow(otherActor())], table: "user" }]);

  await expect(service().me(actor())).resolves.toEqual({
    createdAt: AT, email: actor().email, emailVerified: true, id: actor().id, name: actor().name,
  });
});
```

A service that writes adds `makeUnitOfWork(d1)`, `fixedClock(at)` and `sequentialIds()` to the same
construction.

### Four rules that keep this honest

**1 · The test imports the service, never the router.** HTTP is covered once per context (§3), not
once per rule. A rule tested through the router is a rule whose failure message mentions a status
code instead of a domain error.

**2 · The seam is still `deps`, and the service still knows nothing about a database.**
`makeProfilesService` takes a repo; `ProfilesService.ts` imports no `@gc/db`; nothing in the service
can tell whether the repo it was handed reads SQLite or a `Map`. What D016 changed is what sits
*behind* the repo, not whether the seam exists — and `scripts/check-architecture.mjs` still fails
the build if a query moves up into a service.

**3 · The guard under test is the statement that ships.** A hand-written double can only assert
that its own TypeScript re-implementation of a `WHERE` clause agrees with itself; here SQLite
evaluates the clause that runs in production, against real rows. `Testing/Database.test.ts` shows
the shape for each kind of guard, against the only tables that exist today:

| Guard | Provoked by |
| --- | --- |
| a guarded `UPDATE … WHERE <precondition>` reporting `changes: 0` when it loses | "reports 0 for the losing half of a guarded write and leaves the row alone" |
| a unique index (`user_email_unique`, `session_token_unique`) | "refuses a second session with the same token"; the `batch` cases |
| a foreign key, and `ON DELETE CASCADE` | "enforces foreign keys, so a fixture cannot orphan a row"; "cascades a user's sessions away when the user is deleted" |

**If you add a guard to a repository — a `WHERE` precondition, a `CHECK`, a unique or partial
index — add the test that provokes it in the same commit**, in that context's `<Plural>.test.ts`,
and provoke it through the repository or through raw SQL, never through a re-statement of the rule.

**4 · Time, ids, actors and outside providers are still fakes, and correctly so.** `fixedClock(at)`
makes expiry assertions exact. `sequentialIds()` makes generated ids assertable.
`steppingClock(at, stepMs)` moves time by a known amount between two calls. A provider fake
(`FeatureFlagsFake` today; transcription, LLM and calendar later — `architecture/PROVIDER-FAKES.md`)
is a second implementation of a port we do not own. The line is: **fake what you do not control or
cannot make deterministic; do not fake the thing you are asserting about.** A clock is the first; a
`WHERE` clause is the second.

---

## 3. Wire-shape tests — one per context

```ts
// packages/server/src/Profiles/Profiles.http.test.ts, abridged
const app = new OpenAPIHono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("actor", who);
  c.set("svc", { profiles: { me: stubMe } } as unknown as Container);
  await next();
});
app.route("/", profilesRouter);

it("serialises the caller's profile at GET /me", async () => {
  const res = await app.request("/me");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(profile);
});
```

What it is for: that the route is mounted at the path the contract declares, that validation
rejects a malformed input with 422, that the response matches the contract's schema, and that
`c.var.svc` is reached rather than anything else. **Not** for business rules — those are §2.

One per context is the budget. The signals it catches (a typo in a path, a missing `.openapi()`
call, a response shape that drifted from its schema) are all "wrong everywhere or wrong nowhere",
so a second test of the same router catches nothing the first did not.

`apps/api/src/app.test.ts` covers the assembled app: health, the request id, `GET /me` mounted and
answering 401 without a session, the OpenAPI document listing exactly the contract's paths, a 404,
and the **error body shape** produced by `on-error.ts` — the one place `{ _tag, message, details }`
is constructed. `apps/api/src/e2e-harness.test.ts` holds the harness's fail-closed properties (§6).

---

## 4. Minimum scenarios, by name

These must exist. The names are the specification; the phrasing in the test file may differ.

### `Profiles/Profiles.test.ts`

- `me` answers the caller's own row, with `createdAt` in epoch milliseconds (the `Date` from
  better-auth's column stops at the mapper — D003)
- an unverified address reads `emailVerified: false`, not a default
- a session whose user row is gone → `ProfileNotFound`
- `canReadProfile` lets a person read their own profile, and refuses anyone else with `Forbidden`
  naming the action `profiles.read`
- a user with no `profiles` row reads every detail as `null` and `onboardedAt: null`, and the read
  inserts no row
- `update` sets the details it is given and a later read agrees; it changes only the keys present;
  `null` clears a detail; `{}` is a no-op answering the profile unchanged
- `completeOnboarding` stamps `onboardedAt` with the clock's now, and a later call keeps the first
  stamp; it keeps the details an earlier `update` wrote
- `update` and `completeOnboarding` for an actor whose `user` row is gone → `ProfileNotFound`, not a
  foreign-key 500, including when the row goes between the service's read and its write
- `canReadProfile` and `canEditProfile` each allow the owner and refuse anyone else as `Forbidden`,
  naming their own action
- one person's `update` leaves another person's `profiles` row byte-identical
- deleting a `user` row cascades its `profiles` row

### `Profiles/Profiles.http.test.ts`

- `GET /me` serialises the service's answer verbatim, and the service was called with the actor's id
- with no actor the service is **never called** and the handler throws `Unauthorized`
- `PATCH /me` hands the service the actor and the patch and answers 200; an unknown user type, a
  key the patch does not own (`name`), a LinkedIn username with a space, and a company name over
  100 characters are each 422 `ValidationFailed` without reaching the service
- `POST /me/onboarding` takes no body and answers 200 with `onboardedAt` a number
- `PATCH /me` and `POST /me/onboarding` with no actor are 401 without reaching the service

### `Notes/Notes.test.ts` (phase 4)

- `create` with no input: "Untitled note", body `""`, `startedAt` = now, `trashedAt: null`, one
  attendee, the owner, `isMe: true` with the owner's name; the owner's row is position 0
- `create` with attendees returns them after the owner, in input order, `isMe: false`
- `get` returns what `create` returned, to its owner; an unknown id → `NoteNotFound`
- B's `get`, `update`, `trash` and `restore` of A's note each → `NoteNotFound`, and A's rows are
  byte-identical afterwards
- B's error for A's id and for an id that never existed have the same `_tag`, `status` and
  `details` shape, and `details` is only `{ id }`
- B's `list` never contains A's notes, whatever cursor B sends (A's own included)
- `list` orders `startedAt` desc then `id` desc, and a tie pages without loss or repetition
- 25 notes at `limit: 10` page as 10, 10, 5 with a final `nextCursor: null`; exactly 20 at
  `limit: 20` is `nextCursor: null` (the over-fetch)
- a list item carries no body; `attendeeCount` includes the owner
- keyset stability: an older note created after page 1 appears later, a newer one does not shift
  page 2
- `list` excludes trashed notes, and `restore` puts one back in place
- a malformed cursor → `ValidationFailed` with `details.field: "cursor"`
- `update` changes only the keys present; `{}` does not move `updatedAt`; a trashed note →
  `NoteTrashed`
- `trash` stamps once (the first `trashedAt` and `updatedAt` win); `get` still reads it
- `restore` clears `trashedAt`, and is a no-op on a live note
- a deleted owner cascades notes and attendees; a deleted non-owner attendee's `userId` is nulled
  and the row kept; an attendee with neither name nor email fails the `CHECK`
- renaming the owner's `user` row renames them on every note

### `Notes/Notes.http.test.ts`, `Notes/Cursor.test.ts`, `Domain/Note.test.ts` (phase 4)

- every notes route anonymous → 401 without reaching the service
- `POST /notes` → 201 `Note`; `GET /notes` → 200 `PageOf(NoteSummary)` with no `bodyMarkdown`
- `limit=0`, `limit=101`, `cursor=` → 422; a blank or 201-character title, an unknown key and an
  empty attendee → 422 on create; an unknown key → 422 on patch
- `NoteNotFound` → 404 naming only the id; `NoteTrashed` → 409; `/notes/not-an-id` → 422, not 404
- the cursor round-trips, is base64url of `[startedAt, id]`, and every malformed shape decodes to
  `null`
- `NoteTitle` trims and rejects blank; `NoteCreate`/`NotePatch` reject unknown keys;
  `AttendeeInput` needs a name or an email

### `Recordings/Recordings.test.ts` (phase 5)

- `create` makes an "Untitled note" from the `phone` with the owner as sole attendee, and a
  recording `recording` with `durationMs: null` and `privateNotes: ""`; the note detail carries it
- `create` honours a supplied `startedAt` on both, and uses the clock without one; one recording
  per note (the unique `note_id`)
- `patch` saves `privateNotes` while `recording`; on `uploading` → `RecordingNotActive`
- `discard` of a live recording hard-deletes the note, the recording and the audio object, so the
  note is `NoteNotFound`; on `transcribed` → `RecordingNotActive`
- `end` sets `uploading`, `durationMs`, `endedAt`; a replay is a no-op; on `transcribed` →
  `RecordingNotActive`
- `uploadAudio` before `end` → `RecordingNotUploading`; in `auto` it stores the object at
  `recordings/<ownerId>/<recordingId>`, submits once keyed by the recording id and ends
  `transcribed`; a replay on `transcribed`/`transcribing` stores and submits nothing
- the accepted audio types; `UnsupportedAudioType` 415, `AudioTooLarge` 413 before anything is
  stored, `EmptyAudio` 422
- a finished recording's note body is its private notes, and its title stays "Untitled note"
- `hold` leaves `transcribing` with a job id; `sweep()` is pending while held, completes once in
  `auto`, then completes nothing; a failing poll fails the row; two overlapping sweeps write the
  segments once
- `fail` → `failed` with `transcription_unavailable`; `retry` in `auto` → `transcribed`, re-using
  the stored audio; `retry` on `transcribed` → `RecordingNotRetryable`
- `silent` → `transcribed` with `utterances: []`; segments A, A, B, A → three utterances
- `transcript` of a note with no recording, or one still transcribing → `TranscriptNotFound`
- B's `get`, `patch`, `discard`, `end`, `uploadAudio`, `retry` of A's recording → the absent id's
  `RecordingNotFound`, A's rows untouched; B's `transcript` of A's note → `NoteNotFound`
- the notes list carries `recordingStatus`, the detail `recording`, `null` without one
- a deleted owner cascades recordings and segments; a trashed note's transcript stays readable; a
  duplicate segment position fails the unique index

### `Recordings/Recordings.http.test.ts`, `Transcription.test.ts`, `Domain/Recording.test.ts` (phase 5)

- every recordings route and `GET /notes/{id}/transcript` anonymous → 401 without reaching the
  service; create → 201 `{ note, recording }`; discard → 204 with no body; unknown keys and a
  duration past 6 h → 422; `/recordings/not-an-id` → 422
- `PUT …/audio` hands the service the raw stream, the content type and the declared length;
  `AudioTooLarge` 413, `UnsupportedAudioType` 415, `EmptyAudio` 422, `RecordingNotUploading` 409
- the fake is deterministic; under 60 s one A "Hello. How are you?"; from 60 s
  `ceil(duration / 15 s)` segments across A and B; `hold`/`fail`/`silent` as §6.4; a held job polls
  from another instance; every call recorded; the four transcription errors carry 503/429/422/504
- `groupUtterances` on an empty list, one segment, one speaker, and a returning speaker; the strict
  bodies refuse unknown keys; `RecordingEnd` bounds the duration

### `Generations/Generations.test.ts` (phase 6)

- a recording that settles `transcribed` gets exactly one `queued` row and one queue message; a
  second settle (a sweep after the upload answered) adds neither; nothing is written while
  `transcribing` or for a failed transcription
- a failed enqueue is survivable: the upload still answers `transcribed`, and `sweep()` after
  `QUEUED_STALE_AFTER_MS` sends it (`enqueued: 1`)
- a full note (≥ 60 s, typed "Budget follow-up"): that title, `### Discussion`, `### Your notes`,
  `### Next Steps` with `- **Confirm owners for the open items**`, no fence; without typed notes a
  neutral title, the same for the same transcript
- a brief note (< 60 s, `kind: "brief"`): "Brief check-in", the #40 paragraph, `LOW_CONTENT_TIP`;
  with typed notes the quoted sentence; silence gives "didn’t capture any speech"; only the first
  paragraph of a brief answer is kept
- `run` twice → one LLM call, then `skipped`; a live claim is skipped, a stale one reclaimed at
  attempt 2, and the first claimant's late write changes nothing
- `hold` → `queued`, attempt 0, acked; inline sweeps stay pending until `auto`
- `fail` → `retry`, `retry`, then `failed` / `llm_unavailable` with the fallback title and body;
  `LlmTimeout` likewise; `truncated` and `LlmRejected` fail at once; `malformed` after three calls
- a rename while `generating` wins, and the body is still written; a body edited while `failed`
  wins over a retried generation, which still fills the title
- `retry` on `failed` → `queued`, attempt 0, no failure, enqueued, then generates; on `generated`,
  `queued` or a typed note → `GenerationNotRetryable`; B's retry of A's note → the absent id's
  `NoteNotFound`, A's row untouched
- the note detail carries `generation` (null for a typed note and before `transcribed`); the list
  summary carries the generated title
- a deleted owner cascades the rows; a discard never meets one; a trashed note keeps its row; one
  row per note; `sweep()` counts sends, so a queue outage reads `enqueued: 0`

### `Generations/Output.test.ts`, `Llm.test.ts`, `Domain/Generation.test.ts` (phase 6)

- the parser: a plain object, a ```` ```json ```` fence, a bare fence; control characters stripped
  with `\n`/`\t` kept; non-JSON, an array, a missing or non-string `notes_markdown` and an empty
  body are malformed; `truncated` is truncated even with valid JSON; the title trimmed, collapsed,
  unquoted, without its trailing period, cut at a word boundary to ≤ 80, and `null` when unusable;
  headings to `###`, `*`/`+` to `-`, four-space and tab nesting to two spaces, three levels to
  two, a title-repeating first heading dropped, blank runs collapsed; 100 001 characters is
  malformed; the #31 excerpt round-trips
- the fake is deterministic, records every call (failed ones too), writes the brief and full shapes
  of §6.6, and `hold`/`fail`/`malformed`/`truncated` do as the harness promises
- `isLowContent` at 0, 4, 11, 12 and 16 words and across utterances; the tip and the title bound

### `Chats/Chats.test.ts` (phase 7)

- a global ask streams `turn, activity, citations, token+, done`; the answer is the tokens, the
  title is `titleChat(question)`, `get` returns both messages and `updatedAt` is now; the activity is
  `search, open, done` and the citations come before the first token, numbered in retrieval order
- "What did we decide about pricing?" cites `not_e2e_launch` alone with the pinned §6.6 answer; "Who
  have I promised to follow up with?" falls back to launch, standup, solo
- a note-scoped ask cites only its note with no `search` step; a person-scoped ask (Priya) cites only
  the notes she attended, labelled with her name; an unknown key is `PersonNotFound` before any
  write; the caller's own key covers all their notes
- retrieval never crosses users: `other`'s "zebracorn" note is never cited nor handed to the fake;
  a note-scoped ask on `other`'s note is `NoteNotFound` with no thread; a key only `other`'s notes
  hold is `PersonNotFound`; a send into `cht_e2e_other` is `ChatNotFound`
- a trashed note is never cited; a note-scoped ask on one is `NoteNotFound`; a thread whose note was
  trashed since answers the couldn’t-find line; `empty` gets `search([]), done`, no citations
- only the citations the answer uses are stored; `fail` ends in `error` with the row `failed` and
  the question kept; `retry` streams with no `turn` into the same id; a complete answer or a
  question is `ChatMessageNotRetryable`
- `hold` makes a second send `ChatBusy` until the row is stale, when `get` reads it `failed`, a send
  is allowed and `retry` claims it; releasing `hold` finishes the answer; a reader that stops after
  `citations`, or an SSE stream that aborts through `pipe`, still leaves the answer `complete`
- the list is pinned first, then `updatedAt` desc, `id` desc, paged once each; pinning keeps
  `updatedAt`; `q` matches a title or a message, escapes `%`/`_`, never another user's thread
- pin, unpin and delete (with its messages); a second delete and another user's thread are
  `ChatNotFound`; feedback round-trips, a question is `FeedbackNotAllowed`, another user's message
  `ChatMessageNotFound`; nine models, Auto last and selected with no row written, a selection
  persists and is recorded on the next answer, `premium` and unknown ids `ChatModelUnavailable`
- a deleted user cascades threads, messages and the preference; the scope check refuses a note
  thread without its note

### `Chats/Chats.http.test.ts`, `Chats/Retrieval.test.ts`, `chatStream.test.ts`, `Domain/Chat.test.ts`, `Domain/Person.test.ts` (phase 7)

- every route is 401 without a session and never reaches the service; the three streaming routes
  answer `text/event-stream` whose frames parse through `ChatEvent` and end with `done`; failures
  before the stream are JSON (`ChatBusy` 409, `ChatNotFound` 404, `PersonNotFound` 404,
  `ChatMessageNotRetryable` 409); blank, whitespace-only and 4 001-character content and a scope
  with an extra key are 422; `PATCH` is strict; `DELETE` is 204
- `searchTerms` keeps lowercased words of three letters or more, minus stopwords, at most twelve;
  `scoreNote` gives two per distinct title term and one per distinct body/transcript term, and a
  hyphenated compound is one word; the fake's `titleChat` and best-line picker
- the SSE parser joins split frames (inside a multi-byte character too), reads CRLF and multi-line
  `data:`, skips unknown events and comments, and ends a stream with no `done` as `stream_ended`;
  `askChat` posts through the fetch it is given
- `personKeyOf` lowercases the email and prefers it, else normalises the name; the chips, the
  placeholders and the limits are the §4 constants; content trims before it measures

### `Search/Search.test.ts` (phase 8)

- a title match (`standup`, and `STANDUP` alike) and a body match (`forty`) find their note only, with
  no people; `ra` gives Priya Raman and launch then solo, `an` gives launch, standup, solo
- people by email (`example.com` → Priya, Sam, tied on their last meeting so by name); the caller
  (`e2e`) is one person keyed `email:`, named from `user`, `isMe`, and renamed through
  `ProfilesService.update`
- trash (`archived`, and a guest only on a trashed note) and ownership (`other`, `zebracorn`, a guest
  only on `other`'s note, and `other` searching `launch`) find nothing; `empty` finds nothing
- `%` is literal and finds nothing, `_` finds solo; two casings of one address are one person named
  from the newer note, a name-only guest on two notes is one `name:` person with a null email
- the caps: 60 matching notes answer 50 newest first, 12 matching people answer 8

### `Search/Search.http.test.ts`, `People/People.test.ts`, `People/People.http.test.ts`, `Domain/Search.test.ts` (phase 8)

- `GET /search` parses as `SearchResults`, is 401 without a session, and 422 on a missing, blank
  or 101-character `q`
- a person reads their name, email, domain and `isMe`; the self key has `isMe` and `gcnotes.test`; a
  `name:` key has a null email and domain; an unknown key, a key only `other`'s notes hold and a key
  only on a trashed note are each `PersonNotFound`
- `GET /people/{personKey}` through a URL-encoded key parses as `Person`, is 401, 404 with the
  `PersonNotFound` body, and 422 on `person:priya`
- `domainOf` answers null without an email or an `@`, and lower-cases; `SearchQuery` trims before
  its 1..100 bounds

### `Notes/Notes.test.ts` and `Notes/Notes.http.test.ts` — the person filter (phase 8)

- `list` with Priya's key is launch alone, with the self key launch, standup, solo and never
  archived; `limit 1` walks the filtered list with a null cursor on the last page
- an unknown person and another user's guest are empty pages; `?person=` with a malformed key is 422
- the chat person-scope cases stay green after the match moves to `personMatches` in `@gc/db`

### `Testing/Database.test.ts` — the harness itself

- the real migration files apply, and the database starts empty
- foreign keys are on
- `meta.changes` is 1 for a matching `UPDATE`, 0 for a missing one, per statement through `batch()`,
  and 0 for a `SELECT` rather than the previous write's count
- a unit of work's refs are filled from the real `WHERE` clause
- `batch()` rolls back entirely when any statement throws, including the first, and fails as a
  rejection rather than a synchronous throw
- `seedD1` is one batch, so a bad row rolls back the good ones

### `E2E/E2E.test.ts` — the harness the promotion gate drives

- seeding after a reset produces the same world, and seeding twice is a no-op
- the minted session cookie is one better-auth itself accepts
- the cookie is named for the origin it was asked for (`__Secure-` over https)
- an unknown role is `ValidationFailed`, never an invented user
- (phase 4) the seed writes the five `E2E_NOTES` fixtures with their fixed ids and names them in
  its answer; `person`'s list is exactly launch, standup, solo; `empty` is onboarded with no notes;
  a reset leaves no `notes` or `note_attendees` rows and a re-seed restores a renamed fixture
- (phase 5) `not_e2e_launch` has ≥ 8 utterances alternating A/B from A; `not_e2e_solo` exactly one,
  "Hello. How are you?"; `not_e2e_other` is readable only by `other`; `not_e2e_standup` has none;
  the mode switch answers what it set, refuses an unknown mode, is cleared by a reset, and release
  completes a held recording

### `Integrations/Email/Email.test.ts` and `AuthEmails/AuthEmails.test.ts`

- the email fake records each send in order and writes one row to its sink per send
- scripted `unavailable` raises `EmailUnavailable` (503) and writes nothing; it sends again once reset
- `sendOtp` sends "Your Notes sign-in code" and the §4 body (code, "expires in 5 minutes"), as
  `kind: "otp"` with the code and type in its payload

### `Outbox/Outbox.test.ts`

- `latestOtpFor` answers the newest code for an address; a payload that is not JSON, or not
  `{ otp, type }`, reads as `null` rather than throwing

### `Runtime/AppConfig.test.ts`

- `EMAIL_MODE` absent → `fake`; `fake` (or unset) with `NODE_ENV=production` refused, naming
  `EMAIL_MODE`; `live` refused, naming the missing client; any other value refused
- `TRANSCRIPTION_MODE` the same way: absent → `fake`; `fake` or unset refused in production; `live`
  refused, naming the missing client; any other value refused

### `apps/api/src/otp-send-failure.test.ts`

- a send the email provider refuses answers 503 `EmailUnavailable`, not better-auth's 200 (the
  plugin swallows the hook's error; `betterAuthHandler` rethrows it)

### `apps/api/src/e2e-harness.test.ts` and `app.test.ts` — the real app

- `GET /e2e/otp` is a 404 disarmed and a 401 with a wrong secret; it answers the harness's own 404
  (not the router's) for an address with no mail
- the sign-up round trip in process: a send writes a six-digit code to the outbox, `GET /e2e/otp`
  returns it, `POST /api/auth/sign-in/email-otp` with it sets a session cookie, and a second send
  makes `GET /e2e/otp` return the new code
- `POST /e2e/reset` forgets the newcomer (`user`, `session`, `verification`, `profiles`) and the
  outbox, and leaves `person` and `other` and their sessions intact
- `POST /e2e/seed` leaves both seeded people onboarded, and `person` with their work details
- the `auth.otp.issued` log line never carries the code, even in development
- with `AUTH_RATE_LIMIT=2` the third `/api/auth/*` request in a window is 429 `RateLimited`
- (phase 5) `POST /e2e/transcription` sets and answers the mode, 422 for an unknown one, and a
  reset clears it; `/release` answers the sweep's counts; the seeded launch transcript is served at
  `GET /notes/{id}/transcript`; the `scheduled` handler sweeps a held recording to `transcribed`
  over the real container; the OpenAPI document lists the recordings routes under a `Recordings` tag

### Pure suites

- `packages/domain/src/Errors.test.ts` — `appError` carries its tag and status on the instance and
  the class; `isAppError` is true across factories and false for a plain `Error` or a look-alike
  object; the message defaults to the tag and `cause` is kept as an object. `on-error.ts` decides
  every status by asking exactly these questions.
- `FeatureFlags.test.ts` — **every path that could answer `true` without being asked to**: an absent
  binding, a throwing lookup (async and sync), an unknown key all read `false`; the fake starts the
  keys it was given, records its calls in order, and flips at runtime.
- `UnitOfWork.test.ts` — the chunking arithmetic at `n = 0`, `max`, `max + 1`; chunks concatenate
  back to the input in order; and **reading `.changes` before commit throws**.
- `traced.test.ts` — the sync path, the async path, the throw path, and non-function values passed
  through unchanged.
- `packages/apiclient/src/client.test.ts` — path params, query serialisation omitting nulls, JSON
  bodies, raw bodies passed through untouched, a raw redirect route, `AbortSignal` forwarding, and
  each error tag (`ErrorBody` → `ApiError`, non-`ErrorBody` → `UnexpectedError`, transport →
  `NetworkError`). The generic endpoint is exercised with route shapes written in the test, because
  `GET /me` has no params, query or body. `updateMe` sends `PATCH /me` with a JSON body and decodes
  the profile; `completeOnboarding` sends `POST /me/onboarding` with no body.
- `packages/domain/src/Domain/Profile.test.ts` — `ProfilePatch` trims, turns `""` and whitespace
  into `null`, accepts every `UserType`, and rejects an unknown key.

---

## 5. What the suite cannot prove

Every hand-written double is a model of D1, and a model is a claim. Four claims underpin any suite
built on this harness — and a double proves the first three *by construction*, which is to say not
at all. Three of the four have an engine answering them instead of an author:

1. **A guarded `UPDATE` matching zero rows does not abort the batch** — the other statements'
   writes are still visible afterwards. Exercised by `Database.test.ts` "reports 0 for the losing
   half of a guarded write and leaves the row alone".
2. **`meta.changes` is per statement** — not rows-examined. Every idempotency decision reads this
   number. Exercised by `Database.test.ts` "is per statement, in staging order, through batch()";
   the `ON CONFLICT DO NOTHING` half gets its test with the first repository that relies on it.
3. **A constraint violation aborts the whole batch and throws** — which is what licenses treating
   constraints as alarms rather than control flow. Exercised by `Database.test.ts` "rolls the whole
   batch back when a statement throws".
4. **The practical per-batch statement ceiling** — "far inside any documented limit" is an inference
   until a real batch of that size runs. `D1-NOTES.md` §4 has the arithmetic. A local engine cannot
   tell you what an RPC will carry.

That answer comes from `better-sqlite3`, not from Cloudflare's SQLite, so the honesty boundary
moved rather than disappeared. It is written out in full as the **fidelity ledger** at the top of
`Testing/Database.ts`, and these are the parts of it a green suite says nothing about:

- **Engine skew.** Two SQLite builds. Anything that differs between versions differs here, silently.
- **The bound-parameter ceiling.** D1 caps a statement at 100; this engine does not. A statement
  over the limit passes locally and fails in production — which is why `chunkForBoundParams` has
  its own unit test rather than waiting for the harness to notice.
- **Concurrency.** One connection, statements serialised. "Two racing writers" is staged as two
  statements in one atomic batch; that D1 resolves a genuine race the same way is its
  serialisable-write guarantee, taken on trust.
- **Everything advisory in `meta`** — `duration`, `size_after`, `rows_read`, `rows_written` are
  plausible, not measured. Do not assert on them.

V2 and V3 in `architecture/D1-NOTES.md` §7 are the same probes run against a real local D1, and
they are worth running once; V1 is settled (**D009**). The open **VERIFY** entries left in
`DECISIONS.md` are **D010** (the pinned `@hono/zod-openapi` and `zod` agree), **D011** (does
`startActiveSpan` double-end a span) and **D012** (is the `observability` block shape right).

---

## 6. E2E — the promotion gate

**The suite ships.** `packages/e2e` runs on every merge to `main`, against the dev Worker that was
just deployed, and production is deployed only if it exits 0
(`architecture/DEPLOYMENT.md` §2, `DECISIONS.md` D017).

```bash
API_URL=https://api-dev.gcnotes.example.com E2E_SECRET=… bun run e2e     # from the repo root
```

`E2E_DEADLINE_MS` (default 9 minutes, under the release model's 10) and `E2E_REQUEST_TIMEOUT_MS`
(default 30s) are the only other knobs. `Env.ts` reads and validates all of them **before the first
request**, because the suite's first act is to reset the dev database: discovering a missing
variable halfway through has already destroyed state.

It is **HTTP only — no browser, no device, no local server, no `wrangler dev`.** That is the point
rather than a shortcut. What it exists to prove is that a *deploy* works: bindings resolved, secrets
present, migrations applied, D1 reachable, the module graph initialising at all. The four failures
that motivate the gate are listed in `architecture/DEPLOYMENT.md` §6; every one of them is invisible
to `bun run test` and to `wrangler deploy --dry-run`.

### The journey

`run.ts` wakes the Worker, resets, seeds, signs in as both people, then walks each journey in order.
A failure is reported with its `x-request-id` so the run can be found in the Worker's logs, and
every message names a deploy fault rather than a domain expectation.

| Journey | What only a deployed run can prove |
| --- | --- |
| **WhoAmI** — anonymous `GET /me` → 401 in the error envelope; `GET /me` as `person` and as `other` → each gets their own profile | the minted session is accepted by better-auth on this Worker, the actor middleware resolves it against real D1, the handler reaches the service through the container, and the answer matches the contract this suite was built from |
| **Onboarding** — `PATCH /me { jobTitle }` as `person`, then `GET /me` reads it back; `POST /me/onboarding` twice returns the same `onboardedAt`; `GET /me` as `other` does not show `person`'s job title | the `profiles` migration is applied on this D1, the upsert writes the caller's row and no one else's, and the coalesce holds across two requests rather than two calls in one process |

Each new feature adds the journey that proves its deploy, not its rules — those stay in §2.

### The harness it drives, and why production cannot have one

Four routes, in `packages/server/src/E2E/Http.ts`, mounted unconditionally but built only when the
config arms them:

| Route | Does |
| --- | --- |
| `POST /e2e/reset` | deletes every table in `RESET_ORDER` (`email_outbox`, `profiles`), children before parents, plus the never-seeded newcomer's `user` row (cascading its sessions and profile) and its `verification` rows, as one atomic batch; the seeded people's better-auth rows are kept so their sessions survive |
| `POST /e2e/seed` | writes the two fixed users, `person` and `other`, idempotently, and upserts their `profiles` rows onboarded (`person` also gets `Engineer`, `Notes E2E`, `startup_generalist`) |
| `GET /e2e/otp?email=` | the newest sign-in code the fake email provider wrote to the outbox for that address, `{ email, otp, type, sentAt }`; 404 `NoOutboxMail` when there is none |
| `POST /e2e/session/:role` | mints a **signed** better-auth session cookie for `person` or `other` |

Armed by `E2E_HARNESS=true` plus an `E2E_SECRET` of at least 32 characters, both parsed in
`Runtime/AppConfig.ts`. Disarmed, `container.ts` builds `e2e: null` and the routes answer the app's
own 404 **before reading the header** — a 401 there would confirm to a prober that this deploy has
a harness at all. `apps/api/src/e2e-harness.test.ts` holds all three properties, including that
`parseConfig` refuses to start a Worker where the harness is armed and `NODE_ENV=production`.

Everything else in the graph is the production graph — real services, real repositories, real D1.
When provider fakes arrive (`architecture/PROVIDER-FAKES.md`), dev selects them by environment and
the journeys run against the fake leaf.

### What a green run still does not prove

- **No device.** `apps/native` is never exercised by this suite; it talks to the API the way the app
  does, not through it. The app has its own Maestro flows (§8), which run on a simulator, not in the
  pipeline.
- **Dev is not production.** `NODE_ENV=development` and `EMAIL_MODE=fake` there (the fake writes
  codes to the outbox, which is how anything signs in without an email provider, and `AppConfig`
  refuses it under `production`), and the Flagship app is a different app with different flag
  values.

**The gate must fail, never skip.** `deploy.yml` fails the job outright if `packages/e2e/src/run.ts`
is missing, because a skipped gate promotes an unverified merge to production — the one outcome the
pipeline exists to prevent.

---

## 7. Running them, and two traps

```bash
bun run test                 # everything, through turbo
bun run check                # lint + syncpack + architecture greps + types — the gate
```

**Trap 1: turbo caches `type-check`.** "9 cached" has verified nothing. When you need to know that
types really pass — before a release, or after a dependency bump — purge and force:

```bash
find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete && TURBO_FORCE=1 bun run check
```

**Trap 2: `bun test` must be scoped.** In any package that emits a `dist`, the script is
`bun test src`. Unscoped, every suite runs twice — once from source, once from the build — and the
duplicate run is against code that may be several commits old.

One more worth knowing: `scripts/check-architecture.mjs` is part of `bun run check`, not of
`bun run test`. A pull request that moves a query out of a repository and into a service will pass
every test and fail the gate. That is the intended order of discovery.

---

## 8. Native UI flows (Maestro)

The app's UI is driven on the **iOS simulator** by [Maestro](https://maestro.mobile.dev) 2.8.0,
from `apps/native/.maestro/`. It is not part of `bun run test` or the gate: it needs a simulator, a
native build and Metro, none of which CI has yet.

```bash
bun run e2e:ios          # expo run:ios: prebuild if needed, pods, xcodebuild, install, launch,
                         # then Metro in the foreground — leave it running
bun run maestro:smoke    # second terminal: the flows tagged `smoke`
```

Both default to the simulator **"iPhone 17 Pro", UDID `351547D8-BD3B-4418-AB30-8568D8FFB8F3`**;
set `IOS_SIMULATOR_UDID` to use another. `maestro:smoke` is `scripts/maestro.sh smoke`, which is
exactly:

```bash
maestro --device 351547D8-BD3B-4418-AB30-8568D8FFB8F3 test \
  -e APP_ID=com.rejoan.gcnotes --include-tags smoke apps/native/.maestro
```

Never run a flow against a physical device by accident: every flow starts with `clearState`, so
the device is always named by UDID and never left to "whichever is booted".

### Layout

```
apps/native/.maestro/
  config.yaml            which directories are flows (smoke/*); subflows/ is deliberately not one
  subflows/
    launch-app.yaml      clean launch: clearState + clearKeychain, straight into the JS bundle;
                         MIC param (allow | deny | unset) is the microphone permission
    relaunch-app.yaml    stopApp + launchApp keeping app state and the Keychain (a real relaunch)
    e2e-reset.yaml       POST /e2e/reset then /e2e/seed (scripts/e2e-reset.js); fails on non-200
    start-clean.yaml     launch-app + e2e-reset, then wait for welcome-screen
    request-code.yaml    EMAIL param: type the address, Continue, wait for the code step
    enter-code.yaml      EMAIL param: GET /e2e/otp (scripts/read-otp.js), type it; digit 6 submits
    sign-in.yaml         EMAIL param: request-code + enter-code; the caller asserts where it lands
    sign-in-fast.yaml    ROLE param: stopApp, reset, mint a session (scripts/e2e-session.js), clean
                         launch that adopts it; see "Fast sign-in" below
    open-home-as.yaml    ROLE param: sign-in-fast as a seeded, onboarded person, then settle on home
    open-home.yaml       open-home-as with e2e-person
    open-note.yaml       NOTE_ID param: from home, wait for the row, open its detail
    open-editor.yaml     from a detail, More → Edit notes, wait for the editor
    swipe-to-trash.yaml  NOTE_ID param: swipe the row left until its trash action shows
    start-recording.yaml tap + and wait for the live card (the mic must be allowed)
    wait-for-end.yaml    skip the fake recorder 10 s ahead, so Cancel becomes End at once
    set-transcription.yaml  MODE param: script the fake transcriber (scripts/e2e-transcription.js)
    release-transcription.yaml  switch back to auto and sweep once (scripts/e2e-release.js); since
                         phase 6 the release also runs queued generations inline
    set-llm.yaml         MODE param: script the fake LLM (scripts/e2e-llm.js)
    release-llm.yaml     LLM back to auto, queued generations run inline (scripts/e2e-llm-release.js)
    run-llm.yaml         TIMES param: that many inline passes, one attempt each, mode left alone
                         (scripts/e2e-llm-run.js); three in `fail` end a job failed
    wait-for-long.yaml   skip the fake recorder 60 s ahead, so the note is generated in full
    set-chat.yaml        MODE param: script the fake LLM's chat answers (scripts/e2e-chat.js)
    release-chat.yaml    chat switch back to auto, so a held answer finishes (scripts/e2e-chat-release.js)
    open-global-chat.yaml  from home, the Ask pill, then wait for the chat and its composer
    open-history.yaml    from a chat, open Chat History and wait for its first page
    send-chat.yaml       TEXT param: type into the composer, wait for Send, tap it
    wait-for-answer.yaml N param: wait for answer N's action row, which appears only after `done`
    swipe-history-row.yaml  THREAD_ID param: swipe a history row left until Delete and Pin show
    assert-no-new-note.yaml  home holds only the seeded rows and the + FAB
    tap-footer-link.yaml TARGET/EXPECT/TIMEOUT: tap a keyboard-pinned footer control that may move
  smoke/
    launch.yaml          tag `smoke`: launches signed out and lands on welcome-screen
  phase-2/ … phase-7/   tagged per phase (plus `regression`); phase-3 signs in with real codes
```

The API-backed flows need the local API running with the E2E harness armed; `scripts/maestro.sh`
passes `API_URL` (default `http://localhost:3001`) and reads `E2E_SECRET` from `apps/api/.dev.vars`.

### Rules for writing a flow

- **Select by `id`, never by text.** Every screen root and every control a flow touches gets a
  `testID` named `<screen>-<thing>` (`welcome-screen`, `welcome-email`, `welcome-submit`,
  `home-screen`, `home-settings-button`). Copy changes; ids do not. The one exception is a sheet the
  system owns, which has no id to select.
- **No sleeps.** Wait for the thing you need with `extendedWaitUntil` (`visible: { id: … }`, a
  generous `timeout`); the flow is then exactly as slow as the app.
- **`appId: ${APP_ID}`**, with the default in each flow's `env:` and the real value passed by
  `-e APP_ID=…`, so a second bundle id (a staging build) needs no edit to any flow.
- **Start from a known place.** Reuse `subflows/launch-app.yaml`. It clears the Keychain as well as
  the app's state, because the session cookie lives in SecureStore — the Keychain — and survives
  `clearState`.
- **Let a moving footer settle.** Welcome and onboarding's name step autofocus their field, so the
  software keyboard may rise at any moment after the screen appears (or never, with the hardware
  keyboard connected) and the keyboard-pinned footer rides up with it. Maestro aims a tap from the
  hierarchy it last read, so a tap taken mid-rise lands where the control was: the gallery link was
  once hit on the keyboard's "t" key. Tap a footer control whose miss is harmless through
  `subflows/tap-footer-link.yaml` (waits for stillness, retries a tap that changed nothing); for one
  whose miss would type into the field (Continue), `waitForAnimationToEnd` first.
- **One driver per simulator.** Maestro cannot tell its own taps from anybody else's. A failure
  whose screenshots show screens the flow never opened (Settings, a scrolled gallery) means
  something else was touching the simulator: the device log (`--test-output-dir`, the flow's
  `logs/device-simulator.log`) shows those touches arriving through `dtuhidd` with no matching
  `POST /touch` in the XCTest runner's log. Rerun once the simulator is free; do not "fix" the flow.
- **Tag every flow.** `smoke` is for "the build is not broken" and must stay under a minute and
  independent of the API; journeys that sign in get their own tag and their own seeded backend.

### Fast sign-in

A typed sign-in (email, Continue, read the code from the outbox, six digits) costs 15–25 s, and
almost every flow used to pay it before reaching the screen it is about. So only the flows whose
subject *is* signing in type a code: everything in `phase-3/` (sign in, sign up, the wrong code,
resend, onboarding and its resume, sign-out, a relaunch staying signed in). Every other flow
reaches home through `open-home.yaml` / `open-home-as.yaml`, which use `subflows/sign-in-fast.yaml`:

1. `stopApp`, so the previous flow's app cannot write into the world about to be reset.
2. `e2e-reset.yaml`: reset and seed, as before.
3. `scripts/e2e-session.js`: `POST /e2e/session/<ROLE>` on the harness (the same guard as
   `/e2e/reset` — 404 unless the harness is armed, 401 without `E2E_SECRET`). It writes a real
   better-auth `session` row for the seeded person and answers the cookie signed with better-auth's
   own `makeSignature`, which the script turns into a Set-Cookie header.
4. `launch-app.yaml` with `E2E_SESSION` set: a clean launch (`clearState` + `clearKeychain`) that
   passes the header as the `-gcE2eSession` launch argument.

The app (`apps/native/src/lib/auth-client.ts`, development builds only — the branch sits under
`__DEV__`) reads the argument through React Native's `Settings`, which on iOS is the
NSUserDefaults argument domain, and stores it with `storeSessionCookie` from `@gc/auth/client-native`
— better-auth's own `getSetCookie` into the same SecureStore jar under the same key that a typed code
fills. That happens at module scope, before the first render, so the first `get-session` already
carries it, the server verifies it against the session row, and the gate sends the account where its
profile says: home, for every seeded person. From there nothing differs from a typed sign-in —
the same cookie on every request, the same `GET /me`, and a relaunch without the argument keeps the
jar (the argument domain lasts one launch). A Release build has no such branch, and a deploy with the
harness disarmed has no endpoint to mint a session with.

Roles are the keys of `E2E_USERS` (`person`, `other`, `empty`); the newcomer has no account to
mint a session for, which is why sign-up stays on the typed path anyway.

### Why the launch subflow passes launch arguments

A Debug build is an expo-dev-client: no JavaScript inside, so a clean launch shows the dev launcher
instead of the app. `launch-app.yaml` passes `--initialUrl http://localhost:8081`, which the
launcher reads at startup and loads directly. The obvious alternative — `openLink` to
`gcnotes://expo-development-client/?url=…` — raises iOS's "Open in Notes?" confirmation, and that
sheet **survives an app relaunch**, so one failed run leaves it covering the next. It also passes
three dev-menu user defaults (`-EXDevMenuIsOnboardingFinished YES`, `-EXDevMenuShowsAtLaunch NO`,
`-EXDevMenuShowFloatingActionButton NO`), without which the menu's first-run sheet and then the menu
itself cover the app on every clean launch. All of them are inert in a Release build.

### Visual check

No assertion notices that Newsreader fell back to the system font or that a colour drifted, so the
phase-2 flows also take screenshots: `phase-2-home` (home-shell.yaml), `phase-2-gallery`
(gallery.yaml) and `phase-2-sheet-demo` (gallery-sheet.yaml); phase 6 adds `phase-6-generating`
(#106), `phase-6-generated` (#10), `phase-6-generated-end` (#11) from generate-notes.yaml and
`phase-6-short` (#40, #107) from short-recording.yaml; phase 7 adds the eleven `phase-7-*` shots
listed in docs/spec/phase-7.md §8. Run with
`--test-output-dir <dir>` so they land in one place, then open each next to its discovery shot
(`screens/01-home/shot.png` for home, `screens/16-note-attendees-sheet/shot.png` for the sheet)
before the phase's review step. Check the serif title, the gutters and the fills; a gap is fixed or
recorded in `docs/plan/BLOCKERS.md`. The comparison is by eye, deliberately: discovery was shot on
a 428pt device and the simulator is 402pt, so a pixel diff would fail on width alone.

If every phase-5 recording flow fails on "Couldn’t upload the recording." (`note-status` never
goes), suspect a `wrangler dev` started before a binding was added: it hot-reloads code but not
`wrangler.jsonc`, so a Worker running without `AUDIO` answers the audio PUT with a 500. Restart
the API.

If a smoke run fails on `welcome-screen is visible`, look at the simulator before the flow: a stale
system sheet or Metro not running are the usual causes, and `scripts/maestro.sh` checks the second.
