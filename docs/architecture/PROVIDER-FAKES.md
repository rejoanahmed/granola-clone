# Provider fakes — one port, two implementations, chosen by environment

Notes will depend on three kinds of outside provider: **transcription** (audio in, timed segments
out), an **LLM** (a transcript in, written notes out) and a **calendar** (which meeting is this, and
who was in it). All three cost money per call, need an account and a credential, and are slow or
non-deterministic. None of them may be what a unit test, a local run, the E2E gate or a Maestro
flow depends on.

The repository already has the pattern in miniature: `Integrations/FeatureFlags/` is a port, a live
client over the Flagship binding, and a fake — and `FLAGS_MODE` in `container.ts` picks one. Every
provider copies that shape. No code exists for these three yet; this is the contract the first one
must follow.

## The shape

```
packages/server/src/Integrations/Transcription/
  Port.ts                   the type the consuming service depends on. No vendor types in it.
  TranscriptionClient.ts    the live implementation: HTTP to the vendor, mapping in and out.
  TranscriptionFake.ts      deterministic, in-memory, records its calls.
  Transcription.test.ts     the fake and the client's mapping, against a recorded fetch.
```

The same four files for `Llm/` and `Calendar/`.

```ts
// packages/server/src/container.ts — the only place the choice is made (R5)
const transcription =
  config.transcription.mode === "fake"
    ? makeTranscriptionFake({ clock, ids })
    : makeTranscriptionClient({ ...config.transcription, fetch });

const recordings = traced("Recordings", makeRecordingsService({ clock, ids, repo, transcription }));
```

## The rules

1. **The port belongs to the consumer.** It is shaped by what the service needs ("transcribe this
   audio, give me segments with speaker and start/end ms"), not by what the vendor's SDK exposes.
   A vendor switch is then a new `*Client.ts`, not a change to a service.
2. **The choice is made in `container.ts` and nowhere else**, from a `*_MODE` variable parsed in
   `Runtime/AppConfig.ts` (`fake | live`). Never `NODE_ENV`, never a test-only seam, never an
   `if (isTest)` in a service. The service cannot tell which one it was given (R3).
3. **Live mode fails at startup when half-configured.** `parseConfig` refuses a `live` mode without
   its credential, naming the variable — a 500 on the first request after a bad deploy, not a
   vendor rejection in the middle of somebody's meeting.
4. **The fake is deterministic.** Same input, same output: transcripts derived from a seed (the
   upload's id or bytes), not from `Math.random()`, and times from the injected `Clock`. A flaky
   fake makes every test that uses it flaky.
5. **The fake records its calls** (`calls: readonly {...}[]`), as `FeatureFlagsFake` does, so a
   test asserts what was asked — including that a retry did *not* ask twice.
6. **The fake can be scripted to fail.** Each port's error vocabulary (unavailable, rate-limited,
   rejected input, timeout) is a typed error with its status (R7), and the fake can be told to
   raise each one. The failure paths are the ones worth testing and the ones a live vendor will
   never produce on demand.
7. **Long work is asynchronous and idempotent.** Transcription and note generation outlast a
   request: the service records a job row, the provider is called with an idempotency key the
   caller derived from stable data (the recording id), and completion arrives by webhook or a cron
   sweep (R8). The fake honours the same key, so a retried job is a no-op there too.
8. **Webhooks are raw routes.** A provider callback is verified over the exact bytes sent, so its
   path joins `RAW_ROUTE_PREFIXES` in `apps/api/src/middleware.ts` and its contract declares no
   parsed body. The fake's "callback" goes through the same route, signed with the same secret.

## Which mode runs where

| Where | Transcription | LLM | Calendar | Why |
| --- | --- | --- | --- | --- |
| Unit tests (`bun run test`) | fake | fake | fake | built directly with the fake, no config at all |
| Local `wrangler dev` | fake | fake | fake | top-level `vars` in `wrangler.jsonc`; switch one to `live` in `.dev.vars` to try the real vendor |
| Maestro on the simulator | fake | fake | fake | the flows must not depend on a vendor being up or on audio quality |
| Deployed dev (E2E gate) | fake | fake | fake | the gate proves a *deploy* works; a vendor outage must not block a release |
| Production | live | live | live | set per `env` block — `vars` are not inherited |

A per-environment `*_MODE` var is set in **every** `env` block of `wrangler.jsonc`, and production
must say `live` out loud — the default in `AppConfig` is `fake`, so a forgotten var fails safe
(nothing is charged) rather than silently live.

## What the fakes do not prove

That the vendor's real API matches the client's mapping, that its latency fits the request budget,
and that its output is any good. Those are checked against the vendor's sandbox by hand, or by a
tagged test that runs only with a credential present, and each is recorded in
`docs/DECISIONS.md` as a verification like D010–D012.
