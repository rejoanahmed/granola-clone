# Blockers

- **Recording UI not crawled.** Tapping + on the real account would create a note and start a recording, so phase 5 uses our own design unless the user approves one real recording on a throwaway note.
- **First-run onboarding not crawled.** The account is signed in; phase 3 designs its own.
- **Another project's dev stack holds :8081 and :3001 on this machine (phase 2).** `~/personal/eventsbd` runs Metro on :8081 and its API on :3001, which are this app's defaults. A clean launch then loads the wrong bundle, or reaches the other API and reads as signed in. It is not ours to stop. Workaround until the ports are free: run Metro with `EXPO_PUBLIC_SERVER_URL=http://localhost:3002 bunx expo start --dev-client --port 8082` from `apps/native`, and pass `-e DEV_SERVER_URL=http://localhost:8082` to maestro. `subflows/launch-app.yaml` now honours that override: before, its own `env:` default silently won over `-e`. `scripts/maestro.sh` still probes :8081 only.
