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
