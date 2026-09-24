# Blockers

- **Recording UI partly crawled.** One approved throwaway recording captured the mic primer, the live recording card, the keyboard-up mini bar, the More menu and the post-End states (discovery screens #100–#107). Still unseen: pause, the paperclip menu, Minimize, and the new note's transcript sheet and home-list row — those follow #13–14 and #01.
- **First-run onboarding not crawled.** The account is signed in; phase 3 designs its own.
- **Another project's dev stack holds :8081 and :3001 on this machine (phase 2).** `~/personal/eventsbd` runs Metro on :8081 and its API on :3001, which are this app's defaults. A clean launch then loads the wrong bundle, or reaches the other API and reads as signed in. It is not ours to stop. Workaround until the ports are free: run Metro with `EXPO_PUBLIC_SERVER_URL=http://localhost:3002 bunx expo start --dev-client --port 8082` from `apps/native`, and pass `-e DEV_SERVER_URL=http://localhost:8082` to maestro. `subflows/launch-app.yaml` now honours that override: before, its own `env:` default silently won over `-e`. `scripts/maestro.sh` still probes :8081 only.
- **No sign-out in the app (phase 2).** Home became the static `HomeShell` (#01), and the old home screen's "Sign out" button and `GET /me` read went with it. Settings is where sign-out lives in the product, and the avatar button is inert until then. Workaround: `clearKeychain` (every Maestro flow does it) or deleting the app. Restored when phase 3 (auth) or phase 10 (settings) wires the avatar. Guarded: phase 3's exit in `phases.md` now requires `phase-3/sign-out.yaml` to leave home through a control on it, so phase 3 cannot close with this still open.
- **No live email client (phase 3).** Sign-in codes go through the `Email` port, and the only
  implementation is `EmailFake`, which writes each message to the `email_outbox` table (read back by
  `GET /e2e/otp`). `AppConfig` refuses `EMAIL_MODE=fake` under `NODE_ENV=production`, because the
  fake stores plaintext codes, and refuses `EMAIL_MODE=live` because there is no client to select.
  So the `production` env block in `wrangler.jsonc` sets no `EMAIL_MODE` and **a production deploy
  fails every request at startup** until a live client exists. That was already the truth in
  substance: before phase 3, production email sign-in silently logged `provider: "none"` and sent
  nothing. Stubbed: local and the deployed dev Worker run the fake. Unblocked by a phase that picks
  a provider, writes `Integrations/Email/EmailClient.ts`, and adds its credential to `parseConfig`.
