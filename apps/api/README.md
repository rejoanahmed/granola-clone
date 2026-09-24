# apps/api

The Worker. `fetch` serves the three modules' routers plus the OpenAPI document; `scheduled` runs
the sweepers every five minutes. Both build the same container (R8), and that is the only thing
this app is for — there is no business logic in `apps/api`, and no place to put any.

```
src/worker.ts      fetch + scheduled. The cron body is R8's demonstration.
src/app.ts         the OpenAPIHono assembly: middleware, three routers, better-auth, the doc.
src/middleware.ts  request id, container, actor, CORS, the auth rate limit, the auth handler.
src/on-error.ts    the ONE place an error becomes a status (R7).
src/openapi.ts     /api/doc and /api/reference, from a build-time constant.
```

## Running it

```bash
bun run dev            # preflight + wrangler dev --local on :3001
bun run dev:raw        # the same wrangler line with no preflight
EVB_TUNNEL=1 bun run dev   # also opens a quick tunnel and repoints BKASH_CALLBACK_URL at it
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
| `http://localhost:3001/api/auth/*` | better-auth. Rate-limited, 20/minute per IP |

With `BKASH_MODE=fake` (the default) the container wires `makeBkashFake` — the same object graph,
a scripted leaf — so the whole payment story runs locally with no bKash credentials. Email sign-in
prints the OTP to the `wrangler dev` output: the template ships no email provider, and `NODE_ENV`
is what decides whether the code is logged (see `middleware.ts`).

## Bindings

Declared in `wrangler.jsonc`, typed by `Env` in `@evb/server/Runtime/WorkerEnv` — hand-written, so
a renamed binding is a type error rather than a regenerated file nobody reads.

| Binding | Kind | Used by | Why it exists |
| --- | --- | --- | --- |
| `DB` | D1 | every `*Repo.ts`, via `Runtime/Drizzle` and `Runtime/UnitOfWork` | the only database |
| `KV` | KV | `Integrations/Bkash/BkashClient` | caches the bKash `id_token` under `bkash:token` for 50 minutes. Nothing else is ever stored here |

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
| dev | Cloudflare | `eventsbd-api-dev` | `env.dev` — bKash fake, OTP in the logs |
| production | Cloudflare | `eventsbd-api-prod` | `env.production` — bKash live |

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

The D1, KV and Flagship ids in `wrangler.jsonc` are **named placeholders**, not values — a real id
in git points every clone at one person's data. `scripts/deploy.sh` substitutes each one from the
matching `EVB_*` environment variable and refuses to deploy if one is unset or malformed. Locally
those live in `.deploy.env` (`cp .deploy.env.example .deploy.env`); in CI they are repository
variables. The script header is the one-time setup: which resources to create, which variables carry their ids, and
which dashboard secrets each environment needs.

After the first real deploy, check one trace in the dashboard (D011 and D012 in
`docs/DECISIONS.md`): that `traced()` spans appear and are not duplicated, and that the
`observability` block's outer `"enabled": false` with nested blocks true really is the working
shape. Do not "fix" the outer flag first.

## Two routes that are not like the others

- `GET /payments/bkash/callback` is the only route in the template that does not answer JSON: it
  settles the payment and redirects the payer's browser to `${APP_URL}/payment/return`. The
  handler is still one expression; where to redirect is the service's decision.
- `POST /payments/bkash/webhook` verifies an HMAC over the **exact bytes** bKash sent, so it
  declares no request body — a validator would parse and re-serialise it, and every signature
  would fail for a reason that reads like a bad secret. It and `/api/auth/*` are the two entries in
  `RAW_ROUTE_PREFIXES` in `middleware.ts`: consult that list before adding anything global that
  touches a request body.
