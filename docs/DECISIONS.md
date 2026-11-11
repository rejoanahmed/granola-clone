# Decision log

Every structural choice in this repo that a reader might otherwise take for an accident, so it can
be found and overturned deliberately. Newest last. Each entry says what was decided, why, what it
would cost to reverse, and where the evidence lives.

Gaps in the numbering (D001, D002, D004–D008, D013) are rulings retired with the event-ticketing
domain this repo was cut from; the numbers are not reused.

Status key — **STANDING** (in force), **SUPERSEDED** (replaced by a later entry), **OPEN — VERIFY**
(the decision is made, but it depends on a fact about real infrastructure that has not yet been
checked), **OPEN — CHOOSE** (genuinely the implementer's call; record the choice here when made).

Add an entry whenever you make a choice the next reader would have to reconstruct. Do not edit an
entry to change its meaning — supersede it with a new number and mark the old one SUPERSEDED.

---

## D003 · Timestamps are plain `integer()` epoch ms, unbranded, no `timestamp_ms` mode, no `Date` — **STANDING**

Three choices, one rationale: a timestamp should be an arithmetic value with no ceremony.

- **Plain `integer()`, not drizzle's `timestamp_ms` mode** — the domain type is `number`, so
  `fixedClock(1_700_000_000_000)` makes every expiry assertion exact rather than approximate.
- **Unbranded** — a brand makes `now + minutes * MINUTE_MS` noisy for no safety gained; the values
  are compared to each other and to nothing else.
- **No `Date` in the domain** — a `Date` in a zod schema forces a codec at the wire boundary, and
  nothing here needs one.

The one exception is better-auth's generated tables, whose columns are `timestamp_ms` and come back
as `Date`. `ProfilesRepo` converts at the mapper (`createdAt.getTime()`), so no `Date` leaves a
repository.

When display formatting in a user's timezone arrives, test it on workerd rather than trusting
`Intl.DateTimeFormat`'s `timeZone` option: Workers has been observed to ignore that option and
silently return UTC in a previous codebase built on this template.

Reverse cost: low.
Evidence: `packages/domain/src/Domain/Time.ts`; `packages/server/src/Profiles/ProfilesRepo.ts`.

---

## D009 · `drizzle-orm@0.45` emits `CHECK` and partial unique indexes — **RESOLVED: it does**

Verified against the schema this repo was cut from: `check()` in a table's extras array emits an
inline `CONSTRAINT … CHECK(…)`, and `uniqueIndex(...).where(sql\`…\`)` emits
`CREATE UNIQUE INDEX … WHERE <predicate>` with the predicate intact. Applying the generated SQL to
an in-memory SQLite and provoking each guard confirmed that both bite — including the case that
matters for a partial index, that rows outside the predicate do **not** collide.

The schema today has no `CHECK` and no partial index (only better-auth's tables). The first domain
table that declares either should re-run the check in `architecture/D1-NOTES.md` §7 V1 and add the
provoking case to its `<Plural>.test.ts`, which D016 makes possible.

---

## D010 · `@hono/zod-openapi` accepts the pinned `zod` — **OPEN — VERIFY**

`@hono/zod-openapi` and `zod` are pinned independently, and a mismatch fails as a type error inside
`createRoute` in every contract file at once. The current pair typechecks (`bun run check` is
green with `Profile/Contract.ts`), which is evidence for this pair only.

**On every bump of either:** run `bun run check-types` in `packages/domain` before anything else.
**If they do not typecheck:** pin `zod` to the last working version **everywhere** — one version
across the workspace, which syncpack enforces — and supersede this entry with the observed error.

## D011 · `tracing.startActiveSpan` does not also end the span — **OPEN — VERIFY**

`Runtime/traced.ts` calls `span.end()` on every path: the sync return, both branches of the promise
settlement, and the `catch`. That is correct if the runtime does not end the span itself, and
produces **duplicated spans** if it does.

**What to verify:** deploy once, open one trace in the Cloudflare dashboard, and look for a
duplicated `Profiles.me` / `ProfilesRepo.byId` pair under a single invocation.

**If spans duplicate:** drop the explicit `end()` from the success paths only — the failure paths
still need it if the runtime ends on return rather than on throw — and re-check. Record which.

Evidence when done: a screenshot or a span dump, plus the resulting wrapper.

## D012 · `observability.enabled: false` with nested `logs`/`traces` enabled is the working shape — **OPEN — VERIFY**

`apps/api/wrangler.jsonc` carries:

```jsonc
"observability": {
  "enabled": false,
  "logs":   { "enabled": true, "invocation_logs": true, "head_sampling_rate": 1 },
  "traces": { "enabled": true, "persist": true, "head_sampling_rate": 1 }
}
```

This block is copied verbatim from a deployment where logs and traces demonstrably work. The nested
blocks each carry their own `enabled` and evidently win over the outer flag — but that is inference
from a dashboard, not from a published schema.

**What to verify:** deploy, make one request, and confirm both an invocation log and a trace
appear. **Do not "fix" the outer flag first** — if the shape is wrong, changing it is the fix; if
the shape is right, changing it turns observability off in a way that looks like it turned it on.

Evidence when done: the dashboard, and this entry rewritten as STANDING.

---

## D014 · `packages/db`'s tsconfig carries `"node"` types alongside `@cloudflare/workers-types` — **STANDING**

The seed under `src/seed/**` is in the same project as the schema and uses `process.argv`,
`process.exit` and `import.meta.url`; an explicit `types` array without `"node"` removes those
globals from scope (module imports like `node:fs` still resolve — globals do not), so
`bun run check-types` would fail on the package.

`"node"` is added rather than the seed being excluded, because a seed that is not type-checked is a
seed that rots. `skipLibCheck: true` from `@kn/config/base.json` suppresses the duplicate-global
noise between `@types/node` and `@cloudflare/workers-types`.

The Worker itself never loads these types: `apps/api` and `packages/server` set
`types: ["@cloudflare/workers-types"]` and are separate projects.

---

## D015 · `traced()` casts to a call signature, not to `Function` — **STANDING**

`architecture/README.md` §8.4 originally wrote the dispatch as `(value as Function)(...args)`.
`Function` is banned by Biome's `complexity/noBannedTypes` at error level, so `bun run check` fails
on a file the spec requires to be copied verbatim.

Changed to `(value as (...a: unknown[]) => unknown)(...args)` in **both** the doc and
`Runtime/traced.ts`, so "copied verbatim from §8.4" stays literally true. The narrower type is also
more honest: `Function` accepts constructors and permits any argument list, neither of which is
what a service method is.

Do not resolve this with a `biome-ignore` — an ignore for a rule that is off becomes a
`noUnusedSuppression` diagnostic, which is how a suppression turns into the next failure.

---

## D016 · Service tests run the real repositories against a real SQLite; there are no memory doubles — **STANDING**

`packages/server/src/Testing/Database.ts` is the harness: `makeTestD1()` applies every
`packages/db/d1-migrations/*.sql` to a `better-sqlite3` `:memory:` database with foreign keys on and
presents a `D1Database` facade; `seedD1(d1, tables)` writes fixtures as one atomic batch. Service
tests build the shipped repositories with `makeDrizzle(d1)` and use the real `makeUnitOfWork(d1)`.
There is no `*Repo.memory.ts` and there must not be one.

**Doubles are a liability because the guards worth testing are SQL semantics.** A guard is a
`WHERE` inside a single `UPDATE`; a double re-states it in TypeScript, so a test asserts that the
double's arithmetic is right — not that the shipped statement is. The two drift apart without a test
going red. Worse, whole guards are unreachable: `CHECK` constraints, unique and partial indexes and
foreign keys live only in the DDL, and no object in TypeScript can raise them. The codebase this
repo was cut from ran on hand-written doubles first and deleted 952 lines of them for this reason.

What did **not** change is the seam. R3's seam is the injected `deps`, not the fake behind it:
services still take a repo, still import no `@kn/db`, and still cannot tell what the repo they were
handed talks to. Time (`Testing/Clock.ts`), ids (`Testing/Ids.ts`), actors (`Testing/Actors.ts`)
and outside providers (`Integrations/*/…Fake.ts`, `architecture/PROVIDER-FAKES.md`) are still
faked, because those are injected dependencies rather than database simulations. The rule the whole
entry reduces to: **fake what you do not control or cannot make deterministic; do not fake the thing
you are asserting about.**

The cost, stated plainly. Tests touch a real engine, so a test is milliseconds rather than
microseconds — every case pays for a migration run and an `INSERT` per fixture row. `better-sqlite3`
is a devDependency of `packages/server`: a native module in the dev toolchain and never in the
Worker bundle, because `src/Testing/` is imported only by `*.test.ts`. And the honesty boundary moved
rather than vanished — this is not D1's SQLite build, so engine skew, the 100-bound-parameter
ceiling and genuine concurrency remain unproven. That is written out as the fidelity ledger at the
top of `Testing/Database.ts`, and `Testing/Database.test.ts` proves the properties it does claim.

Reverse cost: high, and it would be a regression.
Evidence: `TESTING.md` §2 and §5; `architecture/D1-NOTES.md` §2;
`packages/server/src/Testing/Database.ts` and its `Database.test.ts`.

---

## D017 · Trunk-based with feature flags; promotion to production is automatic, gated on an E2E against deployed dev — **STANDING**

One branch. Feature branch → PR → CI → merge to `main`, and the merge deploys: verify at the merge
SHA → deploy dev → **E2E against the deployed dev Worker** → deploy production. There is no `dev`
branch, no `staging` branch and no release branch. Unfinished work merges anyway and ships dark
behind a Cloudflare Flagship flag, so *deployed* and *released* stop being the same event.

**Why flags and not branches.** A long-lived branch holds unfinished code away from `main` and away
from every environment that has real bindings, so the first time it meets a real D1, a real Flagship
app and a real credential is the day it lands — mixed with everyone else's three weeks. The unit of
risk becomes the merge, which is the largest object in the system. A flag makes the unit of risk the
toggle: seconds, no build, and the first rollback tier
(`architecture/DEPLOYMENT.md` §3). The flag port fails closed in every branch and takes no
`defaultValue`, because a flag that can default *on* turns someone else's outage into an unplanned
launch; each environment gets its own Flagship app, because one shared app would make every toggle a
developer flips a production release.

**Why the E2E gate, and why it is allowed to take ten minutes.** Four deployment failures are
invisible to `bun run check`, to `bun run test` and to `wrangler deploy --dry-run`: a missing
binding (wrangler inherits nothing into an `env` block, and an unbound `FLAGS` reads as every flag
off — silently), a bad migration, an unset secret (`parseConfig` throws at container build, so the
Worker uploads fine and 500s on the first request) and a module-init failure. None of the four is
flaggable, because a flag is read inside a service inside a request inside a container that has to
build first. The only stage that can see them is one that sends a real request to a real deployed
isolate. Ten minutes of wall clock is the budget.

**Why no manual approval step.** An approval gate is a human asserting something a machine just
measured, and its real effect is latency: changes queue up behind it, releases get bigger, and a
bigger release is the thing that actually hurts. The gate that blocks promotion here is evidence (a
green E2E against the artefact being promoted), and the answer to a bad release is speed of
recovery, not delay before it: flag flip, then `wrangler rollback`, both in seconds.

**What is deliberately excluded from this model: D1.** There is no rollback and no down-migration,
so the schema only moves forward and every migration must be survivable by the Worker already
running. That is the constraint that makes a Worker rollback *safe at all*, since tier 2 leaves the
new schema serving old code permanently. The expand/contract rules and the
constraint-on-a-populated-table trap are `architecture/DEPLOYMENT.md` §4–§5.

Reverse cost, in two halves. Adding a manual approval is **one setting** and no code change: the
`dev` and `prod` GitHub Environments already exist in `deploy.yml` for exactly this, and a required
reviewer on `prod` turns promotion into a prompt. Reintroducing a branch-per-environment model is
the expensive half, and it buys nothing this does not already have.
Evidence: `architecture/DEPLOYMENT.md`; `.github/workflows/deploy.yml` and `ci.yml`;
`apps/api/scripts/deploy.sh`; `packages/e2e`; `TESTING.md` §6;
`packages/server/src/Integrations/FeatureFlags/Port.ts`.

---

## D018 · An owned resource the caller cannot see is a 404, never a 403 — **STANDING**

Phase 4's notes are the first owned resource, and the rule is set for every one that follows
(folders, transcripts, chats). Another user's note answers `404 NoteNotFound`, byte-identical to an
id that never existed: the same `_tag`, the same status, and `details: { id }` carrying only the id
the caller sent. A 403 would confirm the id exists, and ids are not secret. They appear in share
text, logs and screenshots, and a prefix plus a nanoid is guessable enough to probe.

**How it is enforced.** The policy predicates (`canReadNote`, `canEditNote`) stay pure and return
`Authorized<Note>`, so a service method that skips the check still fails to compile. The service
does not throw `Forbidden` when a predicate fails. It routes both "absent" and "not yours" through
one local helper that throws the context's `NotFound`, so the two paths cannot drift into
different bodies. Lists are scoped by construction: the repository filters on the caller's id, and
no route takes a parameter naming an owner. The wire `Note` carries no `ownerId`.

**What it costs.** A real ownership bug and a deleted row look the same from the client, so the
evidence lives in the server logs rather than the status code. `Forbidden` (403) is kept for
actions on a resource the caller *can* see but may not perform, which no context has yet.

Reverse cost: one helper per context. Evidence: `docs/spec/phase-4.md` §6.3;
`packages/domain/src/Notes/Errors.ts`; `Notes.test.ts` cases 4–6 and `Notes.http.test.ts` case 23.

---

## D019 · Bring your own server: each user deploys the backend into their own Cloudflare account — **STANDING**

The app goes public on the App Store, and its privacy promise is structural rather than a policy:
**no recording, transcript or note is ever sent to or processed on a server the developer runs.**
Each user deploys `apps/api` into *their own* Cloudflare account (Worker, D1, R2, Queues, Workers
AI, AI Gateway), and the app is a client that is pointed at that server at first run.

What it changes:

- **First run is "connect your server".** The store build ships with no server address
  (`config.prod.ts` `API_URL: ""`). Welcome shows the connect step (address + pairing token) until
  a server is chosen; the chosen address and the server's self-description (`GET /server`,
  `ServerInfo`) live in the Keychain (`apps/native/src/lib/server.ts`). The module-scope auth and
  API clients are built from it, so choosing a server ends in an app reload rather than a rebuild
  under a mounted tree. A setup link `kothanote://connect?server=…&token=…` (and its QR code) fills
  the step. `GET /server` answers `service: <brand slug>` so the app refuses a URL that is not one
  of these servers.
- **Self-hosting is one command.** `bun run selfhost` (`scripts/selfhost.sh`) creates the D1
  database, R2 bucket and both queues if missing, applies migrations, deploys the `selfhost`
  environment of `wrangler.jsonc` on a `workers.dev` hostname (no domain needed), generates and
  stores `BETTER_AUTH_SECRET` and `OWNER_TOKEN`, and prints the address, the token, the setup link
  and a QR code. Re-running it is the update path. `SELF-HOSTING.md` (repository root) is the guide for
  non-experts.
- **The developer's `production` environment is no longer a hosted service.** It is kept, with the
  same owner configuration as `selfhost`, so `deploy:check` keeps proving that shape bundles. The
  live reference server (the developer's own account, used for App Store review) is a `selfhost`
  deployment like any user's.
- **A "Deploy to Cloudflare" button is not offered yet.** It needs a public repository and a build
  that resolves `workspace:*` packages under Workers Builds; the repo is private. The script is the
  supported path until the repo is public and the button is proven.

What it costs: every user needs a Cloudflare account (free tier is enough for light use; R2 asks
for a payment method to enable), a computer with Bun once, and the patience of a five-minute setup.
That is a real filter on who can use the app, and the reason App Review needs a working demo
server and its credentials in the review notes (`docs/plan/RELEASE.md`).

Reverse cost: high. A hosted mode would need multi-tenant auth, billing and a privacy policy that
says the opposite. Evidence: `scripts/selfhost.sh`; `apps/api/wrangler.jsonc` (`env.selfhost`);
`packages/server/src/Owners`; `apps/native/src/features/server`; `docs/spec/phase-13.md`.

---

## D020 · A self-hosted server has one owner, paired by a token; email OTP stays for development — **STANDING**

Supersedes C2 (the email provider for sign-in OTPs) for the shipped product.

A personal server has exactly one person who should ever read it. Email OTP would need every owner
to bring a mail provider and a verified domain, and an OTP server that finds its URL lets any
stranger sign up an account on it. So `AUTH_MODE=owner`:

- **Pairing.** `POST /owner/session { token }` compares `OWNER_TOKEN` in constant time and, on a
  match, upserts the one owner (`usr_owner`, a normal better-auth `user` row, so `GET /me`,
  onboarding, ownership rules and account deletion are unchanged) and mints a session the same way
  the E2E harness does: a `session` row and a cookie signed with better-auth's own `makeSignature`.
  The app stores the returned `Set-Cookie` in the same SecureStore jar a code sign-in writes.
  A second phone pairs into the same account; the name onboarding set is kept.
- **No other way in.** In owner mode `/api/auth/(email-otp|sign-in|sign-up|callback|link-social)`
  answers 404 before better-auth sees it; session reads, sign-out and user updates stay. The
  pairing route shares the auth routes' per-address rate limit, and the token (24+ characters,
  generated at 32 bytes of entropy by the script) makes guessing pointless.
- **Mail is off.** `EMAIL_MODE=off` fails every send with `EmailUnavailable`; support forms fall
  back to the phone's mail app, addressed to the app's support address (`LINKS.supportEmail`),
  so a report reaches the developer only when the user sends it themselves.
- **Email OTP is kept** as `AUTH_MODE=email-otp` (the default), for local development, Maestro and
  the E2E gate, with the fake outbox as before. A live client exists (`EMAIL_MODE=resend`,
  `RESEND_API_KEY`, `EMAIL_FROM`) for an owner who wants several people on one server.
  `AppConfig` refuses `email-otp` + `off` in production (nobody could sign in) and still refuses
  the fake there.

What it costs: the token is a long-lived bearer credential. Rotation is
`bun run selfhost -- --rotate-token`, which invalidates future pairings but not sessions already
minted (they expire in 30 days or on sign-out); a "revoke all sessions" control is not built.
No Apple Sign-In is needed for this path (C1): there is no third-party login to mirror.

Evidence: `packages/server/src/Owners/*`, `Owners.test.ts`; `apps/api/src/owner-pairing.test.ts`
(pairs, then `GET /me` with the cookie, and proves sign-up is 404); `apps/api/src/middleware.ts`
(`ownerOnlySignIn`).

---

## D021 · Transcription: Workers AI Whisper by default, ElevenLabs Scribe v3 for Bengali, run as a queued job — **STANDING**

Replaces the blocker "No live transcription client".

**The default is `@cf/openai/whisper-large-v3-turbo` on Workers AI** (`TRANSCRIPTION_MODE=workers-ai`),
because it runs in the owner's own account with no second vendor or key. Measured on 2026-11-11
through a local `wrangler dev` against the real model: it takes the app's 64 kbps mono m4a as is
(no transcoding), transcribed 30 minutes in one call in ~80 s, and English is clean. **Bengali is
rough**: on a real 85 s Bengali news clip it produced phonetic spelling with roughly half the words
wrong, and with `language` left to auto-detection it wrote the Bengali speech in **Gujarati
script** (reproduced on the deployed server). With `condition_on_previous_text: true` it fell into
a repeated-syllable loop for the last third; with it off, VAD on and `language: "bn"`, it reached
the end. So the client sends `condition_on_previous_text: false`, `vad_filter: true`, and the
`TRANSCRIPTION_LANGUAGE` hint (`bn` for a Bengali owner). Whisper does not diarise: every segment
is Speaker A. Published figures agree: Whisper large-v3 FLEURS bn WER 89.4% (vendor table), ~71–77%
on other Bengali sets (Dolphin, arXiv 2503.20212).

**The quality option is ElevenLabs Scribe v3** (`TRANSCRIPTION_MODE=elevenlabs`, the owner's
`ELEVENLABS_API_KEY`). Of the vendors checked it has the best published Bengali evidence (Scribe v1
FLEURS bn 8.1% WER; v2 rates Bengali in its ">5–10% WER" tier; v3 improves on every language
tested), it transcribes code-switched speech as spoken when given `secondary_language_codes=en`
(Bengali with English terms stays Bengali with English terms instead of being translated or
transliterated), it diarises up to 32 speakers, accepts m4a, and accepts files far beyond this
app's 100 MB cap. $0.20 per audio hour. The client streams the R2 object into a hand-built
multipart body so the 128 MB isolate never holds a recording.

Rejected, with reasons:
- **Deepgram Nova-3** — on Workers AI it diarises and takes a stream, but `language: "bn"` is
  refused (`AiError 8007`, tested); Deepgram's own API lists bn without published accuracy, and
  its `multi` code-switching mode excludes Bengali.
- **Google Chirp 3** — bn-BD is preview, no diarisation for Bengali, and the setup (GCP project,
  service account, JWT signing from a Worker, a GCS bucket) is the opposite of "paste a key".
- **Gemini audio** — strong on code-switching and cheap, but diarisation and timestamps are prompt
  conventions, not model output; a good second vendor later.
- **OpenAI** (`gpt-transcribe`, the 4o family, whisper-1) — 25 MB per file means chunking, Bengali
  is not called out, and the diarising model is deprecated.

**Shape.** Both engines are synchronous HTTP calls that take minutes for an hour of audio, and the
port's first caller is the upload request. So a live transcriber is the `QueuedTranscription` port:
`submit` writes a ticket beside the audio and enqueues a job (`<slug>-transcription-*` queue);
the queue consumer (15-minute wall clock) runs the engine and writes the answer to
`transcripts/<jobId>.json` in the owner's bucket; the existing cron sweep's `poll` reads it back and
settles the row. The job id derives from the idempotency key, so a replayed upload buys no second
vendor call; a job silent past 20 minutes is re-sent, and after three sends the recording fails as
`transcription_timeout`. No webhook route exists, so the owner configures nothing at the vendor.

Verified end to end on the deployed reference server (2026-11-11): pair → record → upload → queue
→ Whisper → sweep → notes, 42 s of English in ~3.5 minutes (two of them the cron interval).
Not verified: ElevenLabs against the real API (no key); recordings over ~60 MB on Workers AI (the
audio is base64-encoded in memory, so a 100 MB file may exceed the isolate — BLOCKERS.md).

---

## D022 · Notes and Ask: one LLM client over three transports, keys the owner's — **STANDING**

Replaces the blocker "No live LLM client" (notes and chat). `LLM_MODE`:

- `workers-ai` — in the owner's account, no key (the default; model in D025);
- `anthropic` — Claude with the owner's key (D024);
- `openai` — any OpenAI-compatible `/chat/completions` endpoint with the owner's key: OpenAI,
  Gemini's compatibility endpoint, OpenRouter, Groq, a local server (`LLM_BASE_URL`, `LLM_MODEL`).

One `makeLlmClient(transport)` builds the prompts (`Integrations/Llm/Prompts.ts`) and owns the
contract, so every transport answers the same question: the note prompt asks for the phase-6 JSON
(`{"title", "notes_markdown"}`) in the phase-4 markdown subset and states the language rule
(write in the meeting's language; for mixed Bengali/English, Bengali script with English terms as
spoken); the chat prompt hands over the numbered notes and requires `[k]` citations. Transcripts
over 120k characters are cut in the middle with a marker, never silently. The phase-6 parser runs
unchanged on every answer; each transport maps its finish reason onto `truncated` and its errors
onto the `Llm*` classes, so the generation queue's retry rules apply as written.

Verified: the parser accepts every transport's recorded answer (tests); Workers AI live on the
reference server; Claude and OpenAI through recorded HTTP only (no keys were available).

---

## D023 · The product's name, slug, scheme and bundle id are one object — **STANDING**

The app cannot ship as "granola-clone" or as "Notes" (the system app's name), and the final name is
the owner's choice. `packages/domain/src/Brand.ts` is the only place it is written: `app.config.ts`
(display name, slug, scheme, bundle id, the microphone prompt), the native auth scheme and storage
prefix, the server's `NATIVE_SCHEME` default (the wrangler vars no longer set it), `GET /`'s
service name and `GET /server`'s `service`. Renaming is editing that object, then
`scripts/rename-brand.sh <old-slug> <new-slug> <old-bundle-id> <new-bundle-id>` for the places that
cannot import TypeScript (Maestro `appId`s, wrangler resource names, the selfhost script).
**It must happen before the first App Store upload:** a new bundle id is a new app, and an
installed app keeps its old scheme. Candidate names, with conflict checks, are in
`docs/plan/RELEASE.md`.

---

## D024 · Every AI call goes through AI Gateway in the owner's account, logs off; Claude is the paid default — **STANDING**

- **Gateway.** Workers AI calls pass `{ gateway: { id, collectLog, skipCache | cacheTtl } }` to
  the binding; outside vendors (Anthropic, OpenAI, ElevenLabs) are called at
  `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/<provider>` with `cf-aig-collect-log`
  and `cf-aig-skip-cache`/`cf-aig-cache-ttl` headers (`Runtime/AiGateway.ts`). The owner gets one
  place to see usage, set rate limits, add caching or fallbacks, and cap spend, in their own
  account.
- **Logs off by default, per request.** The gateway's log store would otherwise keep every prompt
  (a transcript) and answer (a note). `collectLog: false` / `cf-aig-collect-log: false` is sent on
  every call, so it holds whatever the gateway's own default is. `AI_GATEWAY_LOGS=on`
  (`bun run selfhost -- --gateway-logs on`) keeps them, for debugging.
- **Caching off by default** (`AI_GATEWAY_CACHE_TTL=0` → skip-cache): every note is a unique
  request, and a cached answer is one more copy of a transcript. Rate limiting is a gateway
  setting in the dashboard and needs no code.
- **The gateway is `default`**, which Cloudflare creates on first use (tested: a named gateway that
  does not exist answers `2001: Please configure AI Gateway`; `default` works on a fresh account).
  The setup script cannot create a named one: wrangler's OAuth token has no AI Gateway scope
  (tested, `10000 Authentication error`). An owner who wants a named gateway creates it in the
  dashboard and sets `--gateway <id>`. `AI_GATEWAY_ID=off` calls providers directly. An outside
  vendor needs `CF_ACCOUNT_ID` to build the URL (the script sets it); without it that vendor is
  called directly rather than failing.
- **Claude.** `LLM_MODE=anthropic` uses the official `@anthropic-ai/sdk` (1.3.0, exact), built in
  `container.ts` with the gateway's `anthropic` route as `baseURL` and the policy headers as
  `defaultHeaders`. Default model **`claude-haiku-5-5`** ($0.10/$0.50 per MTok: a one-hour meeting's
  note costs well under a cent); **`claude-sonnet-5-5`** is the quality option (`--llm-model`).
  Notes use a JSON-schema structured output (`output_config.format`), so the answer is exactly the
  phase-6 object; chat streams at `effort: low` (latency-sensitive, grounded in the given notes).
  `max_tokens` budgets were raised (notes 16k, chat 4k) because adaptive thinking spends from them.
  A refusal is `LlmRejected`. The SDK brings `@opentelemetry/api` in transitively; nothing in this
  repo imports it, so the "no `@opentelemetry/*`" rule below is about our code, not the bundle.

Unverified: ElevenLabs' 100 MB uploads through the gateway (its request-size limit for that
provider is not documented where checked); Claude against the real API (no key).

---

## D025 · The zero-key LLM is `@cf/google/gemma-4-26b-a4b-it` — **STANDING**

The first choice, `@cf/google/gemma-3-12b-it`, had been removed from the Workers AI catalogue by
2026-11-11, which is why the first live note on the reference server failed `llm_unavailable`.
Many other entries carry a deprecation date of 2026-11-20 and were excluded. Six current models were
run side by side through the real prompt and the real parser on a mixed Bengali/English meeting and
an English one:

| Model | Mixed bn/en notes | English | JSON parsed | Time |
| --- | --- | --- | --- | --- |
| `@cf/google/gemma-4-26b-a4b-it` | natural code-switched Bengali, every action on the right person, all four topics | complete | both | ~45 s |
| `@cf/openai/gpt-oss-120b` | English, and put Karim's task on Rita | complete | both | 6–10 s |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | good Bengali, topics merged | — | bn only | 2–5 s |
| `@cf/aisingapore/gemma-sea-lion-v4-27b-it` | mixed, one decision mislabelled | complete | both | 3–4 s |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | English | — | bn only | 3 s |
| `@cf/qwen/qwen3.8-27b` | answered reasoning, no content | complete | en only | 17–76 s |

Gemma 4 26B (MoE, 4B active, 256k context) is the only one that was right on both counts that
matter, faithfulness and language, so it is the default; its latency sits inside a queued job and
`LLM_TIMEOUT_MS` (120 s). Chat inherits it and is slow to first token; an owner who minds sets
`LLM_MODEL=@cf/aisingapore/gemma-sea-lion-v4-27b-it` or brings a Claude key. The catalogue moves
monthly: re-run the trial (the script is described in phase-13.md §7.3) when the default is
deprecated.

---

## D026 · Calendar is `off` on a self-hosted server — **STANDING**

`CALENDAR_MODE=off` returns no meetings and finds no event, so the home card shows its empty state
and notes start by hand. It is the only production calendar mode until the OAuth phase; the blocker
"No live calendar client" stays open, but production no longer fails to start for it.

---

## D027 · Entry points to unbuilt features are hidden, not deleted — **STANDING**

App Review rejects dead ends and placeholders (guidelines 2.1 and 2.3.1), and several of the
discovery-faithful screens lead nowhere on a self-hosted server. `Config.SHOW_UNFINISHED`
(`EXPO_PUBLIC_SHOW_UNFINISHED=true`, off by default, so every store build has it off) gates their
entry points:

- **Settings:** the "Get Notes for Mac or Windows" banner (there is no desktop app),
  Notifications (its one toggle needs a calendar and push), Subscription ("Coming soon"), the
  Features section (Chat's one setting is dictation; Phone calls and Watch are "coming soon"
  pages), Share (no store link yet), Recover Corrupted Notes (it only ever answered a canned
  toast), and Data & sharing ("use my data to improve models" is untrue when nothing reaches the
  developer). A plain **Privacy policy** row replaces the card it lived in.
- **Home:** the Get desktop pill, the Phone button (it had no action), and the upcoming-meetings
  card (with `CALENDAR_MODE=off` it could only ever show its empty state and the work-email
  upsell).
- **Chat composer:** the paperclip (both attachment kinds were disabled, "Coming soon"; its room is
  kept so the model pill does not move) and the dictation mic (its only answer was "Dictation
  isn't available yet"). An empty composer now shows Send, inert.
- **Live recording card:** the always-disabled paperclip.

The screens, routes and their code are kept for the phases that finish them. Maestro flows that
drive a hidden entry point are tagged `unfinished`, and `scripts/maestro.sh` excludes that tag
unless `EXPO_PUBLIC_SHOW_UNFINISHED=true`. Flows that only passed one on the way now assert that it
is absent. The parity pass (`bun run parity`) needs the flag on, because it compares against
discovery.

Reverse cost: one environment variable, per build.

---

## D028 · A slight palette shift away from the reference product — **STANDING**

The tokens were sampled from another product's screenshots, and a public app should not read as
a copy of it. Only colour changed. Layout, typography, radii and the dark style are untouched, and
the change is confined to `apps/native/src/design/tokens.ts` (plus the splash background in
`app.json`):

- the yellow-green accent family became sea-green: `lime #B0BF40 → #5CC8AA`,
  `limePale #E5EACC → #CFEEE4`, `limeSwitch #B2C248 → #5ECBAD`, `olive #677B00 → #1E7563`,
  `oliveDark #424625 → #1F3A34`, `olive.glyph #8A9A2A → #3FA88C`, `olive.ring #515B1F → #1E5246`,
  `recording.pauseFill #656E2D → #2C6B5C`, `tile.share #ADC06F → #8FCFB8`;
- the neutral greys took a slight cool tint, at the same lightness: `bg.app #262626 → #24262A`,
  `bg.list #1A1A1A → #181A1D`, `bg.sheet #2A2A2A → #282A2E`, `bg.tile #282828 → #26282C`,
  `bg.tileRaised`/`border.hairline #333333 → #313438`, and the other near-black surfaces alike;
- text was cooled to match: `primary #FCFDF8 → #F7F9FB`, `secondary #A8AAA1 → #A4A9AF`, and
  `tertiary #8A8A8A → #90959B`, which is *lighter*, so tertiary text passes AA on every surface.

Contrast, WCAG 2.1: primary on the app background 14.4:1; secondary on the list 7.4:1; tertiary
5.0:1 on the app background and 4.8:1 on sheets, up from 4.4 on the old palette (tertiary appears on a raised tile only as an icon, at 4.1:1,
above the 3:1 non-text bar); the dark glyph
on the bright accent 8.5:1; white on the deep accent (Send) 5.3:1, up from 4.7. The `lime`/`olive`
key names are kept as role names, because renaming them would touch every screen for no change in
behaviour. The phase-12 parity report's colour rows describe the old palette and are not rewritten.

---

## D029 · The privacy policy is served by every server at `/privacy` — **STANDING**

`docs/legal/PRIVACY.md` is the source. `bun scripts/render-privacy.ts` embeds it in
`apps/api/src/legal/privacy-source.ts`, and the Worker renders it at `GET /privacy` (public HTML,
the app's colours). A test fails if the embedded copy and the file differ. Chosen over GitHub
Pages because the repository is private, which puts Pages behind a paid plan, and because a page
on every server means the app can open **the user's own server's** copy (Settings → Privacy
policy). The App Store listing's privacy URL is the reference server's,
`https://kothanote-server.bold-breeze-539b.workers.dev/privacy`, until a real domain exists. The
policy is written against the code: what each optional vendor receives is taken from the request
builders (`Prompts.ts`, `ElevenLabsScribe.ts`, `ResendClient.ts`), not from boilerplate. It also
states the current gap that deleting an account leaves the audio in R2. `TODO(Rex)` marks what
only the publisher can fill in.

---

## D030 · The name is Kothanote — **STANDING**

Chosen by the owner on 2026-11-11 from the candidates in `docs/plan/RELEASE.md`: Bangla *kotha*
(talk, words) and note. `packages/domain/src/Brand.ts` now says display name **Kothanote**, slug
and scheme `kothanote`, iOS bundle id `com.rovierr.kothanote` and Android application id
`com.kothanote.app` (the publisher's pattern for its other app: `com.rovierr.<slug>` on iOS and
`com.<brand>.app` on Android), and domain `kothanote.app`. The rename also covered the workspace
scope (`@gc/*` → `@kn/*`), the root package, the wrangler and self-host resource names
(`kothanote-*`), every Maestro `appId`, and every product-name string in copy, tests and flows.
"notes" as a common noun is unchanged. The GitHub repository is still `granola-clone`; renaming it is
the owner's call. GitHub redirects the old URL, and `apps/web/src/site.ts` holds the one link to
update. The reference server moved from `gcnotes-server` to `kothanote-server` (fresh D1, same
pairing token). The `gcnotes-*` resources on the account are now unused.

---

## D031 · The monorepo follows the publisher's other app (Chapterly), except where it would not fit — **STANDING**

The owner's other shipping app is the reference for layout and release conventions. Read-only, in
`/home/rex/Projects/rovierr/chapterly/chapterly`. Both repositories grew from the same template, so
`apps/api`, `apps/native`, `packages/{domain,server,db,auth,apiclient,e2e,config}`, turbo,
syncpack, ultracite, husky, the module pattern and the gate were already the same shape.

**Adopted:**
- `apps/web`, a TanStack Start app on a Worker, built by Vite with `@cloudflare/vite-plugin` and
  deployed by `wrangler deploy`, exactly as Chapterly's web is. Same plugin order, same
  `tsconfigPaths`/`@web/*` alias, same port, same exact versions (D033).
- `packages/tokens`: the palette moved out of `apps/native/src/design/tokens.ts` (which now
  re-exports it) into one package that the app, the landing (via a generated `tokens.css` of Tailwind
  theme variables) and the brand script all read. `emit-css.ts --check` joins `bun run check`, as in
  Chapterly.
- `packages/shared` for code two apps share. Today that is the privacy-policy renderer and its
  source, read by the API and the landing.
- `scripts/brand-mark.ts` + `scripts/brand-assets.ts` (`bun run brand`): one mark drawn as code, every
  icon and the social card generated from it, outputs committed (D032).
- `mise.toml` pinning Bun 1.4.2; `.easignore` (EAS uploads from the repo root, so it restates the
  ignores and drops docs and `.git`).
- The EAS setup, profile for profile (D034), and `EXPO_PUBLIC_APP_ENV`'s three values
  `local | dev | prod`.

**Deliberately not adopted:**
- **`bunfig.toml`'s hoisted linker.** Chapterly adopted it for an Expo SDK 58 peer-duplication bug.
  This app is on SDK 57, and Metro could not be verified on this Linux machine. Revisit with the
  SDK 58 upgrade.
- Firebase/Crashlytics and its config plugins. There is no crash reporting, by the privacy promise
  (D019).
- i18n (`packages/localization`), the UI kits (`ui`, `console-ui`, …), the lesson, studio and bank
  packages, `tools/`, `business/`, the device-lab scripts, `deploy-direct.yml`, and
  `check-testids.mjs`/`check-workflows.mjs`. Either the product has nothing they serve, or this
  repo already has an equivalent gate (`check-ci.mjs`).
- `store-assets/` and `bun run store`. They wait on real App Store screenshots.
- The package scope: Chapterly's `@bo/*` is its own. This repo uses `@kn/*`.

---

## D032 · The icon: a speech bubble holding a waveform over a line — **STANDING**

Original (no letterform, nothing traced), in the D028 palette: a mint bubble (`accent.lime`) on the
deep-teal tile (`accent.oliveDark`), with five dark bars and one teal line. What was said, becoming
a note. Checked rendered at 1024, 60, 40 and 29 px: at 29 only the bubble and the bars survive,
which is enough. The source is `scripts/brand-mark.ts`. `bun run brand` writes:
`apps/native/assets/images/{icon,icon-dark,icon-tinted,splash-icon,adaptive-foreground,adaptive-background,adaptive-monochrome}.png`
and `icon.svg`, plus `apps/web/public/{icon.svg,favicon.ico,apple-touch-icon.png,icon-192.png,icon-512.png,icon-maskable-512.png,og.png,site.webmanifest}`.
The tinted and monochrome variants cut the bars out of the bubble. Android's adaptive and maskable
icons keep the mark inside the 66% safe zone. `app.json` wires them the way Chapterly does
(`icon`, the splash plugin's `image`), plus iOS 18's `ios.icon.{light,dark,tinted}` and Android's
`adaptiveIcon`, which Chapterly does not use. It rasterises with `rsvg-convert` rather than
Chapterly's headless Chrome, because this repo has no kit app to borrow a browser from.

---

## D033 · The landing page — **STANDING**

`apps/web`, deployed to the owner's personal account as `kothanote-web`
(`https://kothanote-web.bold-breeze-539b.workers.dev`), with `/` and `/privacy` (the D029 source,
through `@kn/shared`). The section order and rhythm follow a common product-page pattern,
studied from heypocket.com for structure only: hero with a device picture, three promises, a feature
grid, how it works, a closer look, privacy, open source, FAQ, support. Every word, the CSS-drawn
phone, the icon and the social card are original. No text, image, logo or code was taken. Copy is
held to the code's facts: speaker labels only with ElevenLabs, Bengali rough on the free default,
one owner per server, iPhone first. `TODO(Rex)` marks the support address and the App Store link
(`apps/web/src/site.ts`). The domain is not attached: `kothanote.app` was not registered at the
registry when checked (RDAP 404) and is not a zone on the account. Once it is, add the custom-domain
route in `apps/web/wrangler.jsonc` and redeploy (`docs/plan/RELEASE.md`).

---

## D034 · EAS is configured exactly as Chapterly's, on the same owner and Apple team — **STANDING**

- `apps/native/eas.json` mirrors Chapterly's. The profiles are `development` (simulator,
  `EXPO_PUBLIC_APP_ENV=local`), `development-device`, `preview` (internal, `dev`), `production`
  (`bun 1.4.2`, `environment: production`, auto-increment, channel `production`), and `apk-prod`,
  `apk-dev` and `apk-local`. Submit profiles are `internal` and `production` (Android tracks
  `internal`/`production`, `releaseStatus: completed`). `appVersionSource: remote`.
- `app.json`: `owner: "rovierr"` (Chapterly's EAS owner; `eas-cli whoami` lists it),
  `runtimeVersion: { policy: "appVersion" }` as Chapterly. Platforms are `ios` and `android`, with
  an Android block (application id, `softwareKeyboardLayoutMode: resize`, adaptive icon,
  `RECORD_AUDIO`, expo-audio's `recordAudioAndroid`). The app stays iPhone-first: `supportsTablet:
  false`, and no Android-specific work was done.
- Apple team **BXW3A78H2C**: Chapterly's, read from its latest EAS iOS build log, because no config
  file in that repo names it. It is set as `submit.*.ios.appleTeamId`. `ascAppId` is left out until
  the App Store Connect record exists (Chapterly's is a number only that record gives).
- Credentials are EAS-managed and remote: the default when `credentialsSource` is unset, which is
  what Chapterly does. On the first build, EAS offers the `rovierr` account's existing iOS
  distribution certificate (one per team, shared across apps). It creates the App ID and a new
  provisioning profile for `com.rovierr.kothanote`, because profiles are per bundle id. On the
  first submit it offers the account's stored App Store Connect API key and Google Play
  service-account key. The Android upload keystore is generated per app on the first Android build
  unless the owner deliberately chooses Chapterly's (`docs/plan/RELEASE.md` §3 has the prompts).
  Nothing was generated, uploaded or deleted from here.
- `extra.eas.projectId` and `updates.url` are absent until `eas init`. See RELEASE.md §3 for where
  they land.

---

## Open choices

Record the choice here as a new numbered entry when it is made.

### C1 · Whether `apps/native` ships Apple Sign-In — **OPEN — CHOOSE** (moot for owner servers, D020)

It is an iPhone app that offers Google sign-in, so App Store review will likely require it. If it
ships, the `verifyIdToken` + `appBundleIdentifier` handling must be written with **the rule that
any unverified-token fallback fires only for key-resolution failures and never for a signature,
expiry, audience or issuer failure.** A fallback that swallows a signature failure is an
authentication bypass.

If it does not, `welcome.tsx` ships email OTP (and Google where configured), and Apple is a
documented gap.

### C2 · The email provider for sign-in OTPs — **SUPERSEDED by D020** (owner pairing; `resend` for multi-person servers)

The OTP is logged in development only (`apps/api/src/middleware.ts`), so email sign-in does not work
in production until a provider is wired in. It goes behind a port with a fake, per
`architecture/PROVIDER-FAKES.md`.

---

## What is not here, and why

So that "it's missing" and "it was cut" are distinguishable.

**Product:** everything. The meeting-notes features (recording, transcription, summaries,
calendar) are specified separately and not built yet; the only endpoint is `GET /me`, kept so the
module pattern stays demonstrated and tested.

**Infrastructure:** no KV or Durable Objects. Queues, R2, Workers AI and AI Gateway arrived with
recording, notes and self-hosting (phases 5, 6, 13), and are in every `env` block that needs them. No cron (a `scheduled` handler arrives with
the first recurring job, R8). No web app (the product is iPhone only). No Effect, `@effect/*` or
`@opentelemetry/*` (tracing is `traced()` over `cloudflare:workers`; a real OTel backend is
`architecture/README.md` §8.7). No analytics or error reporting. No design system.
