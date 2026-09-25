# Phase plan

The autonomous loop reads this file, takes the first phase whose status is `todo`, runs it, and
flips the status. A phase is `done` only when every exit criterion below holds on a clean tree.

- **Spec source:** `~/personal/granola-clone-discovery/` (55 captured screens of Granola iOS 1.15.7).
  Every screen reference below (`#10`, `#25`, …) is a directory under `screens/`. It stays
  outside the repo because it is screenshots of someone else's product.
- **Branding:** the app is "Notes". No Granola name, logo, copy that names Granola, or bundled
  Granola asset. The serif display face is a free substitute (Newsreader or Instrument Serif),
  not Tiempos.
- **Providers:** every external dependency — transcription, LLM, calendar, email — is a fake
  selected by environment (`docs/architecture/PROVIDER-FAKES.md`). No real key is required for any
  phase to reach `done`.

## Every phase, the same loop

1. **Spec slice** — `docs/spec/<phase>.md`: the screens in scope, their states, and acceptance
   criteria as Given/When/Then. Each criterion names the Maestro flow that proves it.
2. **Tests first** — the Maestro flows and the API tests are written and fail for the right reason.
3. **Build** — API (domain → repo → service → Http, per AGENTS.md) and native, in parallel worktrees.
4. **Gate** — cache-busted `bun run check`, `bun test`, and `maestro test --include-tags=phase-N,smoke`
   on the iPhone 17 Pro simulator. The *whole* suite for earlier phases must still pass.
5. **Review** — an adversarial reviewer agent reads the diff against the spec and AGENTS.md;
   findings are fixed or recorded in `docs/plan/BLOCKERS.md` with a reason.
6. **Commit** — conventional commits, one PR-sized branch per phase merged to `main` locally.

Maestro rules: select by `testID` only; one flow per journey; shared `subflows/` for launch,
sign-in and seeding; tags `smoke`, `phase-N`, `regression`; no `sleep`, only `extendedWaitUntil`
and assertions; every flow starts from `clearState` + `clearKeychain` + the e2e reset/seed
endpoint, so flows are order-independent.

A blocker never stops the loop: it is written to `BLOCKERS.md`, stubbed behind a fake, and the loop
moves on. A phase that fails its own exit criteria gets three attempts, then is marked `blocked`.

## Phases

| # | Phase | Status |
|---|---|---|
| 0 | Discovery | done |
| 1 | Bootstrap | done |
| 2 | Design system and app shell | done |
| 3 | Auth and onboarding | done |
| 4 | Notes: list, detail, edit, trash | done |
| 5 | Recording and transcript | done |
| 6 | AI notes | done |
| 7 | Ask / chat | done |
| 8 | Search and people | done |
| 9 | Folders | done |
| 10 | Settings, profile and upsells | done |
| 11 | Upcoming events (fake calendar) | done |
| 12 | Parity pass and CI | done |

### 2 — Design system and app shell
Tokens from `discovery/README.md` (dark only: `#262626` header, `#1A1A1A` list, `#B0BF40` lime
FAB, `#677B00` send, `#FCFDF8` text, …), serif display + SF Pro, pill buttons, 44pt floating
circular icon buttons, sheet chrome (top radius ~40). A component gallery screen behind a dev flag.
Home shell (#01) with static content: toolbar, serif "My notes", events card, Ask pill, FAB.
**Exit:** `phase-2/home-shell.yaml` asserts every toolbar/FAB/pill testID; gallery renders.

### 3 — Auth and onboarding
Email sign-in via better-auth (already in the template), with the email provider faked (the code
is readable from the e2e harness). First-run onboarding is our own design, because the crawl could
not see Granola's. Profile fields from #82–84 are created here.
**Exit:** flows for sign up, sign in, sign out and a relaunch staying signed in. Sign-out closes
the phase-2 gap (BLOCKERS.md, "No sign-out in the app"): `phase-3/sign-out.yaml` must start on
`home-screen` as a signed-in user and reach `welcome-screen` through a control on home (the
`home-settings-button` avatar, or whatever replaces it). A flow that clears the Keychain instead
does not count, so the phase cannot exit while a signed-in user still has no way out.

### 4 — Notes: list, detail, edit, trash
API: notes CRUD, markdown body, attendees, soft-delete trash, keyset-paginated list.
Native: home list grouped by day, newest first (#01), note detail with the date/attendees pill
(#10–11), attendees sheet (#16), More menu (#12), the raw markdown editor with Save/Close (#31),
edit title (#02), long-press menu (#02), swipe to trash (#03), and the empty state.
**Exit:** flows for opening a note, editing and saving the body, renaming, trashing by swipe and by
menu, and the empty list; API tests for ownership (another user's note is not reachable).

### 5 — Recording and transcript
The + FAB starts a recording (expo-audio) → recording screen → stop → upload → fake transcriber →
speaker-grouped transcript sheet (#13–14, `Speaker A`, yellow initial avatar, no timestamps).
The recording UI follows discovery #100–#107 (mic primer, live card with lime bar, Cancel→End pill,
keyboard mini bar, Discard-only More menu, then Uploading → Generating → finished note).
Test builds use a fake recorder, because a simulator mic cannot be scripted.
**Exit:** flows for record → stop → transcript visible, cancelling a recording, and denying mic
permission.

### 6 — AI notes
A fake LLM turns the transcript plus the user's notes into structured markdown (headings, bullets,
bold next-step pairs, #10), generates the title, and gives short recordings the canned "Not much to
transcribe here" body (#40). It is a queued job with an idempotent claim, the same shape as
hono-port's summariser.
**Exit:** flows for a recording producing a titled note with sections, and a short recording
producing the canned body; unit tests for the output parser.

### 7 — Ask / chat
Three scopes: global (#70), note (#19) and person (#66). Empty states and suggestion chips (4
global, 3 scoped); the composer with a rotating placeholder and a send/mic toggle; a model picker
backed by a fake model list; a streamed answer from a fake LLM with tool-activity disclosure
(#26–27), numbered citation chips that open a note preview (#28), Copy and thumbs actions; and chat
history with search, pin and delete (#24, #72–74). Retrieval runs over the caller's own notes only.
Out of scope: photo attachments, dictation, Copy as image.
**Exit:** flows for each scope, a chip sending, citation → preview, history pin/delete/search; API
tests that retrieval never crosses users.

### 8 — Search and people
Live search (#60–64): People and Previous meetings sections, matching titles and body text, and a
no-results state. People are derived from note attendees. The person page (#65) lists their meetings
by day and has a person-scoped Ask (reusing phase 7).
**Exit:** flows for a title match, a body match, no results, and person → their meeting.

### 9 — Folders
Left-edge-swipe drawer (#50), create folder, add to folder from a note (#17–18), and the home list
filtered by folder. The populated states were never seen, so they follow the empty state's visual
language.
**Exit:** flows for create → add a note → filter → remove.

### 10 — Settings, profile and upsells
The settings list (#80–81), profile edit and user type (#82–84), notifications (#85), chat (#86),
report a bug (#90, faked sender), data & sharing, sign out, delete account, the Get desktop sheet
(#51) and the work-email upsell (#04). Phone calls (#87), Watch (#88) and Subscription are shown as
static "coming soon" pages.
**Exit:** flows for editing the profile and relaunching (it persists), a toggle persisting, sign
out, and delete account.

### 11 — Upcoming events (fake calendar)
A fake calendar provider seeds events. The home card lists upcoming meetings (magenta bar,
`1:00 PM ‒ 2:00 PM`), and tapping one starts a note linked to that event. Real Google OAuth is a
later, key-dependent phase outside this plan.
**Exit:** flows for the card showing a seeded event and event → note carrying its title and
attendees.

### 12 — Parity pass and CI
An agent screenshots every clone screen at the same state and compares it against the matching
discovery shot; gaps become issues, which are fixed or deferred with a reason. CI runs the gate that
needs no simulator — `bun run check` and `bun run test` — on every push. **Maestro stays local only**
(decided 2026-09-25): no macOS runner and no Maestro job in CI; the local full-suite gate per phase is
the E2E check. Pin Bun to the version in `packageManager`.
**Exit:** a parity report with no open "must" gaps; CI green for check and unit tests; the full
Maestro suite green locally.

## Out of scope
Phone-call recording, Apple Watch, the desktop app, real integrations (Google Calendar, real
LLM/transcription keys), payments, sharing to other users, photo attachments in chat.
