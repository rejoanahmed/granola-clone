# apps/api

The Worker. `fetch` serves the modules' routers plus the OpenAPI document. A future `scheduled`
handler builds the same container (R8). That is the only thing this app is for — there is no
business logic in `apps/api`, and no place to put any.

```
src/worker.ts      fetch. A cron, when one exists, goes here beside it (R8).
src/app.ts         the OpenAPIHono assembly: middleware, the routers, better-auth, the doc.
src/middleware.ts  request id, container, actor, CORS, the auth rate limit, the auth handler.
src/on-error.ts    the ONE place an error becomes a status (R7).
src/openapi.ts     /api/doc and /api/reference, from a build-time constant.
```

## Running it

```bash
bun run dev            # preflight + wrangler dev --local on :3001
bun run dev:raw        # the same wrangler line with no preflight
```

First run, from the repo root:

```bash
bun run db:generate
cd apps/api && bun run local:db:apply && cd ../..
cp apps/api/.dev.vars.example apps/api/.dev.vars
bun run db:seed
```

| URL | What |
| --- | --- |
| `http://localhost:3001/` | health — answers without touching D1 |
| `http://localhost:3001/api/reference` | Scalar, the page you actually use |
| `http://localhost:3001/api/doc` | the OpenAPI 3.1 document it renders |
| `http://localhost:3001/api/auth/*` | better-auth. Rate-limited per IP: `AUTH_RATE_LIMIT`/minute, default 20, 600 locally |
| `http://localhost:3001/e2e/otp?email=…` | the latest sign-in code sent to an address (harness only, `x-e2e-secret`) |

Email goes through the `Email` port (`@kn/server/Integrations/Email`), and `EMAIL_MODE=fake` — the
only mode that exists — writes every message to the `email_outbox` table instead of sending it.
Read a sign-in code from there, or from `GET /e2e/otp`; no log line carries one. `AppConfig`
refuses the fake under `NODE_ENV=production` and refuses `live` until a client exists, so
production sign-in waits on a real provider (`docs/plan/BLOCKERS.md`). The other providers that
cost money or need an account (transcription, LLM, calendar) are picked by environment the same way.

## Bindings

Declared in `wrangler.jsonc`, typed by `Env` in `@kn/server/Runtime/WorkerEnv` — hand-written, so
a renamed binding is a type error rather than a regenerated file nobody reads.

| Binding | Kind | Used by | Why it exists |
| --- | --- | --- | --- |
| `DB` | D1 | every `*Repo.ts`, via `Runtime/Drizzle` and `Runtime/UnitOfWork` | the only database |
| `FLAGS` | Flagship | `Integrations/FeatureFlags/FeatureFlagsClient` | the dark-launch switch; optional locally, where `FLAGS_MODE=fake` |

Non-secret configuration is in `wrangler.jsonc` under `vars`; secrets are in `.dev.vars` locally
and dashboard secrets in production. `keep_vars: true` is what stops a deploy that does not mention
them from pruning them. `.dev.vars.example` is the committed catalogue of the second list.

Run `bun run cf-typegen` if you want `worker-configuration.d.ts` for editor completions; it is
generated, gitignored, and nothing in this app imports it.

## Deploying

Three environments, two of which are real:

| | Where | Worker | Config |
| --- | --- | --- | --- |
| local | your machine | — | the top level of `wrangler.jsonc`, ids permanently zero |
| dev | Cloudflare | `kothanote-api-dev` | `env.dev` — E2E harness armed, OTP in the logs |
| production | Cloudflare | `kothanote-api-prod` | `env.production` — no harness |

```bash
bun run deploy:check   # dry-run BOTH deployed environments; uploads nothing
bun run migrate:dev    # D1 migrations only, remote dev
bun run deploy:dev     # migrations, then the Worker
bun run deploy:prod    # same, production
```

`deploy:check` is the gate: it builds the bundle and resolves every binding in both environments,
which is what CI runs on a pull request and what an agent may run. The other three really deploy
and are **the repository owner's or the pipeline's call, never an agent's**.

Migrations run **before** the Worker in each environment, because D1 has no rollback —
`wrangler d1 migrations` is create/list/apply and nothing else. Every migration must therefore be
backward-compatible with the Worker already deployed (expand/contract): add the column, deploy the
code that writes it, drop the old one a release later. Rollback is the Flagship flag first
(seconds), `wrangler rollback` second, a new migration third.

The D1 and Flagship ids in `wrangler.jsonc` are **named placeholders**, not values — a real id
in git points every clone at one person's data. `scripts/deploy.sh` substitutes each one from the
matching `GC_*` environment variable and refuses to deploy if one is unset or malformed. Locally
those live in `.deploy.env` (`cp .deploy.env.example .deploy.env`); in CI they are repository
variables. The script header is the one-time setup: which resources to create, which variables carry their ids, and
which dashboard secrets each environment needs.

After the first real deploy, check one trace in the dashboard (D011 and D012 in
`docs/DECISIONS.md`): that `traced()` spans appear and are not duplicated, and that the
`observability` block's outer `"enabled": false` with nested blocks true really is the working
shape. Do not "fix" the outer flag first.

## Raw routes

`/api/auth/*` is the one entry in `RAW_ROUTE_PREFIXES` in `middleware.ts`: better-auth reads the
body itself, so nothing global may parse it first. A signed provider webhook (a transcription
callback, when one exists) joins that list, and declares no request body in its contract — a
validator would parse and re-serialise the bytes, and every signature would fail for a reason
that reads like a bad secret.
