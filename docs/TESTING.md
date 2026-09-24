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
    launch-app.yaml      clean launch: clearState + clearKeychain, straight into the JS bundle
    relaunch-app.yaml    stopApp + launchApp keeping app state and the Keychain (a real relaunch)
    e2e-reset.yaml       POST /e2e/reset then /e2e/seed (scripts/e2e-reset.js); fails on non-200
    start-clean.yaml     launch-app + e2e-reset, then wait for welcome-screen
    request-code.yaml    EMAIL param: type the address, Continue, wait for the code step
    enter-code.yaml      EMAIL param: GET /e2e/otp (scripts/read-otp.js), type it; digit 6 submits
    sign-in.yaml         EMAIL param: request-code + enter-code; the caller asserts where it lands
    open-home-as.yaml    EMAIL param: start-clean + sign in as a seeded, onboarded person, on home
    open-home.yaml       open-home-as with e2e-person
    open-note.yaml       NOTE_ID param: from home, wait for the row, open its detail
    open-editor.yaml     from a detail, More → Edit notes, wait for the editor
    swipe-to-trash.yaml  NOTE_ID param: swipe the row left until its trash action shows
    tap-footer-link.yaml TARGET/EXPECT/TIMEOUT: tap a keyboard-pinned footer control that may move
  smoke/
    launch.yaml          tag `smoke`: launches signed out and lands on welcome-screen
  phase-2/ … phase-4/   tagged per phase (plus `regression`); phase-3 signs in with real codes
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
(gallery.yaml) and `phase-2-sheet-demo` (gallery-sheet.yaml). Run with
`--test-output-dir <dir>` so they land in one place, then open each next to its discovery shot
(`screens/01-home/shot.png` for home, `screens/16-note-attendees-sheet/shot.png` for the sheet)
before the phase's review step. Check the serif title, the gutters and the fills; a gap is fixed or
recorded in `docs/plan/BLOCKERS.md`. The comparison is by eye, deliberately: discovery was shot on
a 428pt device and the simulator is 402pt, so a pixel diff would fail on width alone.

If a smoke run fails on `welcome-screen is visible`, look at the simulator before the flow: a stale
system sheet or Metro not running are the usual causes, and `scripts/maestro.sh` checks the second.
