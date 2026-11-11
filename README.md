# Kothanote

**Private meeting notes on your own server.** Kothanote records a meeting on your iPhone, turns it
into a transcript and AI-written notes, and lets you search, file and ask questions across
everything you have recorded. Nothing goes to us: every user runs the backend in **their own
Cloudflare account**, and the app pairs with that server. Kothanote is a
[Rovierr](https://rovierr.com) product.

- **Website:** https://rovierr.com/kothanote
- **Privacy policy:** https://rovierr.com/kothanote/privacy (source: [docs/legal/PRIVACY.md](docs/legal/PRIVACY.md))
- **Set up your server:** [SELF-HOSTING.md](SELF-HOSTING.md), about ten minutes, once
- **App Store:** coming soon
- **Contact:** kothanote@rovierr.com

## How it works

```
iPhone app ──pairing token──▶ your Worker (Cloudflare, your account)
                                ├─ D1        notes, transcripts, people, folders
                                ├─ R2        the audio
                                ├─ Queues    transcription and note generation
                                └─ AI Gateway (logs off) ─▶ Workers AI by default,
                                                            or your own Claude / OpenAI / ElevenLabs key
```

`bun run selfhost` creates every resource above in the user's account and prints a pairing token
and a setup link; the app's connect screen takes either (D019, D020). The AI defaults and the
gateway are D024 and D025 in [docs/DECISIONS.md](docs/DECISIONS.md).

## Monorepo layout

```
apps/
  api/        the Worker: the API, its queue consumers and cron; OpenAPI at /api/doc     :3001
  native/     the iPhone app (Expo): connect, record, notes, Ask, search, folders
    .maestro/ UI flows on the iOS simulator
  web/        rovierr.com/kothanote and its /privacy page: TanStack Start on a Worker  :3043
packages/
  domain/     @kn/domain     schemas, route contracts, error classes, Brand.ts. No I/O.
  server/     @kn/server     services, repositories, policies, handlers, provider ports and fakes
  db/         @kn/db         drizzle schema, D1 migrations, the deterministic seed
  auth/       @kn/auth       better-auth and its native client
  apiclient/  @kn/apiclient  the typed client derived from the contract
  tokens/     @kn/tokens     the palette, shared by native and the site
  shared/     @kn/shared     code two apps share (the privacy policy and its renderer)
  e2e/        @kn/e2e        HTTP journeys against a deployed server
  config/     @kn/config     tsconfig presets
docs/
  architecture/  the architecture spec, D1 notes, deployment, provider fakes
  DECISIONS.md   numbered rulings
  TESTING.md     the test harness, the E2E gate, Maestro
  spec/          the per-phase specs the app was built from
  plan/          RELEASE.md (the App Store checklist) and BLOCKERS.md
  legal/         the privacy policy
```

The architecture is modular Hono on Cloudflare Workers, described in
[docs/architecture/README.md](docs/architecture/README.md). Two rules carry it: **`@kn/db` appears
only in `*Repo.ts`, and `hono` never appears in a service.** [AGENTS.md](AGENTS.md) has the full
import table and the recipe for adding a module; `bun run check` enforces both.

## Development

Needs [Bun](https://bun.sh) (`mise.toml` pins the version), and Xcode with an iOS simulator for
the app.

```bash
bun install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then set BETTER_AUTH_SECRET
(cd apps/api && bun run local:db:apply)
bun run db:seed                                    # deterministic users and notes
bun run dev                                        # the API on :3001 and Metro
```

In development, email sign-in logs the one-time code to the `wrangler dev` output, and every
outside provider (transcription, LLM, calendar, email) is a deterministic fake
([docs/architecture/PROVIDER-FAKES.md](docs/architecture/PROVIDER-FAKES.md)).

| Command | What |
| --- | --- |
| `bun run dev` | the API and Metro |
| `bun run dev:api` / `dev:native` / `dev:web` | one surface (native also starts the API) |
| `bun run check` | the gate: lint, syncpack, architecture, CI shape, branding, parity report, tokens, types |
| `bun run fix` | auto-fix lint and version drift |
| `bun run test` | every package's unit suite, then the gate scripts' own tests |
| `bun run build` | build every package |
| `bun run db:generate` / `db:migrate` / `db:seed` / `db:studio` | drizzle-kit, via `@kn/db` |
| `bun run auth:generate-schema` | regenerate `packages/db/src/schema/auth.ts` (never hand-edit it) |
| `bun run e2e:ios` | build the dev client and run it on the iOS simulator |
| `bun run maestro:smoke` | (second terminal) the Maestro smoke flow against that simulator |
| `bun run parity` | capture the parity screenshots ([docs/parity/REPORT.md](docs/parity/REPORT.md)) |
| `bun run e2e` | the HTTP journeys against a deployed server (`API_URL`, `E2E_SECRET`) |
| `bun run brand` | regenerate the app icons and the social card |
| `bun run selfhost` | create or update a self-hosted server in your Cloudflare account |
| `bun run deploy:check` | dry-run both deployed environments; uploads nothing |
| `bun run deploy:web` | deploy the site to rovierr.com/kothanote |

**Turbo caches `type-check`**, so a run reading "N cached" has verified nothing:

```bash
find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete && TURBO_FORCE=1 bun run check
```

## Deploying

Users deploy their own server with `bun run selfhost` ([SELF-HOSTING.md](SELF-HOSTING.md)). The
publisher's reference server, which also serves App Review, is deployed the same way. The `dev`
and `production` environments in `apps/api/wrangler.jsonc` still use `*.kothanote.example.com`
placeholder hostnames ([docs/architecture/DEPLOYMENT.md](docs/architecture/DEPLOYMENT.md)).
[docs/plan/RELEASE.md](docs/plan/RELEASE.md) is the path to the App Store.

## Reference

| Document | What |
| --- | --- |
| [AGENTS.md](AGENTS.md) | The contract for anyone (or any agent) writing code here |
| [docs/architecture/README.md](docs/architecture/README.md) | The architecture, R1–R8, the import table, `traced()` |
| [docs/architecture/DEPLOYMENT.md](docs/architecture/DEPLOYMENT.md) | Environments, the pipeline, rollback, expand/contract migrations |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Numbered rulings |
| [docs/TESTING.md](docs/TESTING.md) | The SQLite harness, wire-shape tests, the E2E gate, Maestro |
| [SELF-HOSTING.md](SELF-HOSTING.md) | The user's guide to their own server |
