# Phase 13 — Bring your own server

The app goes public, and its privacy promise is that **no recording ever reaches a server the
developer runs** (D019). Each user deploys the backend into their own Cloudflare account with one
command, pairs their phone with a token (D020), and transcription and notes run on real providers
the user controls (D021, D022, D024, D025). This phase replaces the four "no live client" blockers
that kept production from booting, and turns the repository from a hosted-service template into a
self-hosted product.

## 1. Scope

In:

- `GET /server` (public self-description) and `POST /owner/session` (pairing), the `Owners`
  context, and `AUTH_MODE=owner` with the email sign-in routes closed.
- Live providers: `TRANSCRIPTION_MODE=workers-ai|elevenlabs` behind a queued port;
  `LLM_MODE=workers-ai|anthropic|openai`; `EMAIL_MODE=off|resend`; `CALENDAR_MODE=off`. All AI
  calls go through AI Gateway with logging off (D024).
- `wrangler.jsonc` `env.selfhost`, `scripts/selfhost.sh` (`bun run selfhost`), `SELF-HOSTING.md`.
- Native: the connect step on welcome, the `connect` deep link, the chosen server in the Keychain,
  the support forms' mail-app fallback on a mail-less server.
- `packages/domain/src/Brand.ts`, the one rename point (D023), and `scripts/rename-brand.sh`.
- A live reference server on the owner's personal account, which also serves App Review.

Out: choosing the name, the visual theme, an app icon, App Store Connect, vendor accounts (all the
owner's; `docs/plan/RELEASE.md`); a Deploy-to-Cloudflare button (needs a public repo, D019);
calendar OAuth; chunked transcription of very long recordings on Workers AI (BLOCKERS.md).

## 2. Server

### 2.1 `GET /server` → `ServerInfo`

Public, no session. `{ auth: "owner" | "email-otp", email: boolean, llm, transcription,
transcriptionLanguage, service: BRAND.slug, version: 1 }`. Names providers, never keys. The app
refuses an answer whose `service` is not this product's slug, and a `version` below its own.

### 2.2 `POST /owner/session { token }` → `OwnerSession`

`OwnerPairingDisabled` (404) on an email-otp server; `OwnerTokenInvalid` (401) for any wrong token,
compared in constant time; rate limited with `/api/auth/*`. On a match, one batch upserts
`user` `usr_owner` (email from `OWNER_EMAIL`, name kept if onboarding set one) and inserts a
`session`. The answer is `{ cookie: { name, value }, expiresAt, setCookie }`, signed exactly as
better-auth signs its own, with the `__Secure-` prefix over https.

### 2.3 Owner mode closes self sign-up

With `AUTH_MODE=owner`, `/api/auth/(email-otp|sign-in|sign-up|callback|link-social)…` answers the
app's 404 before better-auth runs. `get-session`, `sign-out` and `update-user` stay.

### 2.4 Configuration (`Runtime/AppConfig.ts`)

| Variable | Values | Refused when |
| --- | --- | --- |
| `AUTH_MODE` | `email-otp` (default), `owner` | `owner` without `OWNER_TOKEN` of 24+ chars; `email-otp` + `EMAIL_MODE=off` in production |
| `EMAIL_MODE` | `fake` (default), `off`, `resend` | `fake` in production; `resend` without `RESEND_API_KEY` or `EMAIL_FROM` |
| `TRANSCRIPTION_MODE` | `fake` (default), `workers-ai`, `elevenlabs` | `fake` in production; `elevenlabs` without `ELEVENLABS_API_KEY` |
| `TRANSCRIPTION_LANGUAGE` | `auto` (default), an ISO 639 code (`bn`, `en`) | anything else |
| `LLM_MODE` | `fake` (default), `workers-ai`, `anthropic`, `openai` | `fake` in production; `anthropic`/`openai` without `LLM_API_KEY`; `openai` without `LLM_MODEL` |
| `LLM_MODEL`, `LLM_BASE_URL` | model id; OpenAI-compatible base | — |
| `CALENDAR_MODE` | `fake` (default), `off` | `fake` in production |
| `AI_GATEWAY_ID` | `default` (default), a gateway id, `off` | malformed |
| `AI_GATEWAY_LOGS` | `off` (default), `on` | — |
| `AI_GATEWAY_CACHE_TTL` | seconds, `0` (default) = skip cache | negative |
| `CF_ACCOUNT_ID` | 32 hex | malformed |
| `API_URL` | now optional (CORS for the docs page only) | — |
| `NATIVE_SCHEME` | now optional, defaults to `BRAND.scheme` | — |

### 2.5 Queued transcription (D021)

`submit` → ticket `transcripts/<jobId>.ticket.json` + a message on `TRANSCRIPTION_QUEUE` → answer
`pending` (`jobId = tx_<key>`). The consumer (`worker.ts`, queues named `*-transcription*`) runs the
engine and writes `transcripts/<jobId>.json` (`done` with segments, or `failed` with
`rejected|timeout|unavailable`). It retries a transient failure up to 3 deliveries, then writes it
as unavailable. `poll` reads the answer; with none after 20 minutes it re-sends, and after 3 sends it
fails as a timeout.

## 3. Native

### 3.1 First run

A store build has no server (`config.prod.ts` `API_URL: ""`). Welcome renders `ConnectServer` when
there is no server, when the stored server is an owner server, or when opened by a setup link.
Otherwise it renders the email code flow, as before. That keeps development builds and every
earlier Maestro flow unchanged: they have `localhost` and an email-otp server.

### 3.2 Connect

Fields `connect-url` and `connect-token`, button `connect-submit`, error line `connect-error`,
link `connect-setup-guide`, and `connect-different-server` when a server is already stored.
`normalizeServerUrl` adds `https://`, keeps the origin only, and refuses plain http except a
loopback/LAN address in a development build. Then `GET /server`. On an owner server it pairs and
stores the `Set-Cookie` with `storeSessionCookie`. It saves `{url, info}` to the Keychain
(`<slug>-server-v1`) and reloads (`Updates.reloadAsync`, or `DevSettings.reload` in development).

### 3.3 Setup link

`<scheme>://connect?server=…&token=…` → `app/connect.tsx` → welcome with both fields filled. The
user still taps Connect. `connect` is a public route.

### 3.4 Support on a mail-less server

When `ServerInfo.email` is false, Report a bug and Send feedback open the phone's mail composer to
`LINKS.supportEmail`, with the subject and the message, instead of posting to the server.

## 4. Deployment

`env.selfhost` in `wrangler.jsonc`: `workers_dev: true`, owner auth, `off` mail and calendar,
Workers AI for both providers, the `ai` binding, D1 `gcnotes-db`, R2 `gcnotes-audio`, queues
`gcnotes-{generation,transcription}-selfhost`, the cron. `scripts/selfhost.sh` is idempotent.
`deploy.sh check` now dry-runs `selfhost` too. `production` carries the same owner configuration.

## 5. Copy

- Connect title: **Connect your server**
- Connect body: **{Name} keeps your recordings and notes on a server you own, in your own
  Cloudflare account. Enter its address and the pairing token from setup.**
- Errors are `CONNECT_COPY` in `features/server/connect.ts`, one per failure.

## 6. Acceptance criteria

| # | Given / When / Then | Proved by |
| --- | --- | --- |
| AC1 | An owner server, any caller: `GET /server` answers `auth: "owner"` and names no key | `owner-pairing.test.ts` "describes itself" |
| AC2 | The right token → a session cookie that `GET /me` accepts, as `usr_owner` | `owner-pairing.test.ts`, `Owners.test.ts` |
| AC3 | A wrong token → 401 `OwnerTokenInvalid`, nothing written | `Owners.test.ts` |
| AC4 | An owner server offers no email sign-in or sign-up | `owner-pairing.test.ts` |
| AC5 | A second pairing lands in the same account and keeps the onboarding name | `Owners.test.ts` |
| AC6 | Each provider mode refuses to start without its credential, naming it | `AppConfig.test.ts` |
| AC7 | A live transcriber answers pending at upload, sends one job per key, and settles on poll | `Live.test.ts` (queued port) |
| AC8 | Whisper is called with VAD on, conditioning off, the language hint, through the gateway with logs off | `Live.test.ts` |
| AC9 | Scribe gets Bengali + English secondary, diarised; speakers lettered by first appearance | `Live.test.ts` |
| AC10 | Every LLM transport's note answer passes the phase-6 parser; errors map to `Llm*` | `LlmClient.test.ts`, `AnthropicTransport.test.ts` |
| AC11 | Every AI call carries the gateway policy, logs off unless `AI_GATEWAY_LOGS=on` | `AiGateway.test.ts`, `Live.test.ts`, `AnthropicTransport.test.ts` |
| AC12 | The connect rules: URL normalising, server check, pairing failures | `apps/native/src/features/server/connect.test.ts` |
| AC13 | `bun run selfhost` on a fresh account deploys a server that answers `/server` | run on the reference account, 2026-11-11 |
| AC14 | A real recording goes upload → transcript → notes on the deployed server | run on the reference server, 2026-11-11 (English; Bengali in D021) |
| AC15 | The connect screen pairs a physical iPhone with the reference server | **not run**: no iOS build on this machine (BLOCKERS.md) |

## 7. Notes for the next phase

### 7.1 What was measured live

The Whisper and Nova-3 probes, the six-model LLM trial (D025), the gateway behaviour (D024), and
both end-to-end runs used a throwaway local `wrangler dev` with the `ai` binding, which calls the
real models in the logged-in account. Nothing about those probes is in the repo. They are
recorded so the next person reruns them rather than trusting this file.

### 7.2 What is not proven

The Claude, OpenAI and ElevenLabs clients against their real APIs (no keys); 100 MB uploads to
ElevenLabs through the gateway; Workers AI on recordings over ~60 MB; the native connect screen on
a device.

### 7.3 Re-running the model trial

Feed `noteMessages()` for a mixed Bengali/English transcript and an English one to each candidate
through `env.AI.run`, parse with `parseGeneratedNote`, and compare language, attribution, JSON
validity and time. That was the D025 method.
