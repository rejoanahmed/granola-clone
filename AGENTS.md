# Working in granola-clone

Read this before writing anything. [README.md](README.md) is the tour; this file is the contract.
The authority above both is [docs/architecture/README.md](docs/architecture/README.md) — if this
file and that one disagree, that one wins and this one is a bug.

**What this is:** the backend and iPhone app for **Notes**, a meeting-notes app. It is at the
bootstrap stage — the architecture, auth, the gate and one example module (`GET /me`) exist; the
product features do not yet. Never use the name or branding of any existing notes product in
code, copy or assets; the app is called Notes until the owner picks a name, which lives only in
`packages/domain/src/Brand.ts` (D023). Since phase 13 the product is **bring-your-own-server**
(D019): each user runs this backend in their own Cloudflare account (`bun run selfhost`), signs in by
pairing (D020), and AI calls go through their AI Gateway with logs off (D024).

## The gate

```bash
bun run check
```

Lint (ultracite/Biome) + syncpack + `scripts/check-architecture.mjs` + `scripts/check-ci.mjs`
(the CI workflow's shape) + `scripts/check-branding.mjs` (no other product's name in source) +
`scripts/check-parity-report.mjs` (the parity report is whole, with no `must` left open) + types,
across the whole monorepo. **Do not end a session while it is failing.** `bun run fix` auto-fixes the lint and the
version drift; the architecture failures are yours to fix by moving code.

Two traps make a green run a lie:

- **Turbo caches `type-check`.** "8 cached" has verified nothing. The escape is
  `find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete && TURBO_FORCE=1 bun run check`.
- **`bun test` must be scoped** (`bun test src`) in any package that emits a `dist`, or every suite
  runs twice — once from source, once from the build.

`bun run test` runs the unit suites (`turbo test`) and then the gate scripts' own tests
(`bun test scripts`). UI flows on the iOS simulator are separate and slower:
`bun run e2e:ios`, then `bun run maestro:smoke` in a second terminal — see
[docs/TESTING.md](docs/TESTING.md) §8. They target the simulator by UDID; never point them at a
physical device.

## The three-package shape

```
packages/domain   @kn/domain   DECLARES the contract. Schemas, route definitions, error classes.
                               No I/O, no Drizzle, no Workers globals. The clients import it too.
packages/server   @kn/server   IMPLEMENTS it. Services, repositories, policies, handlers, Runtime,
                               provider ports and their fakes.
apps/api          api          MOUNTS it. The Worker: fetch, and a cron when one exists.
apps/native       native       The iPhone app (Expo). Imports @kn/domain, @kn/apiclient, @kn/auth.
```

The arrow only points left. `packages/domain` must never import `packages/server`; `apps/native`
must never import either `@kn/server` or `@kn/db`.

## The import rules — this is the architecture

| File | May import | May **not** import |
| --- | --- | --- |
| `packages/domain/src/Domain/*.ts` | `zod`, other `Domain/*` | anything in `packages/server` |
| `packages/domain/src/<Ctx>/Contract.ts` | `Domain/*`, `@hono/zod-openapi` | anything in `packages/server` |
| `packages/server/src/<Plural>/<Plural>Repo.ts` | `@kn/db`, `drizzle-orm`, `@kn/domain/*`, `../Runtime/*` | `hono`, other contexts' repos, any service |
| `packages/server/src/<Plural>/Policy.ts` | `@kn/domain/*`, `../Auth/Policy` | `@kn/db`, `drizzle-orm`, `hono` |
| `packages/server/src/<Plural>/<Plural>Service.ts` | `@kn/domain/*`, `./Policy`, its own `Deps` types (type-only imports of other repos are fine) | `@kn/db`, `drizzle-orm`, `hono`, `c.env`, `process.env` |
| `packages/server/src/<Plural>/Http.ts` | `hono`, `@hono/zod-openapi`, `@kn/domain/<Ctx>/Contract`, `../AppEnv`, `../Auth/Actor` | `@kn/db`, any `*Repo`, any other context |
| `packages/server/src/container.ts` | everything | — |

Two of those carry the design: **`@kn/db` appears only in `*Repo.ts`, and `hono` never appears in
a service.** Biome's `noRestrictedImports` enforces the paths;
[`scripts/check-architecture.mjs`](scripts/check-architecture.mjs) enforces the four things a lint
rule cannot see:

1. `process.env` / `c.env` outside `container.ts` and `Runtime/*`.
2. A `*Repo` imported as a **value** by anything but `container.ts` and a `*.test.ts`.
   `import type { ProfilesRepo }` is legal everywhere; that is how a service names its repo.
3. A `*Deps` field that is not `readonly`.
4. `@kn/db` outside `*Repo.ts` and `Runtime/Drizzle.ts`.

## The rules, short form

- **R1** The contract is a file. Route definitions live in `packages/domain/src/<Ctx>/Contract.ts`,
  named `<verb><Noun>Route`; handlers do not.
- **R2** The repository is the only thing that knows there is a database. Domain types out, never
  rows. `null`, never `undefined`. No policy checks, no clock reads.
- **R3 (load-bearing)** A service is `export const makeXService = (deps: XDeps) => ({…})` with an
  explicitly declared `readonly` deps type. **Nothing is constructed inside a factory** — not the
  clock, not the id generator, not an HTTP client, not a transcription or LLM client. A dependency
  a factory builds itself is a dependency no override and no test can reach. The factory is
  synchronous. `export type XService = ReturnType<typeof makeXService>` is the only service type.
- **R4** Policy predicates are pure and return `Authorized<A>` — a branded type, so a service
  method that forgets its check fails to compile where it passes the value on.
- **R5** `Env` is read in `container.ts` and `Runtime/*`. Nowhere else, ever. That includes the
  choice between a real provider and its fake.
- **R6** A handler is one expression. If it needs a conditional, the branch belongs in the service.
  The test is whether a cron with no HTTP context could invoke the same operation.
- **R7** Errors carry their status (`class ProfileNotFound extends appError("ProfileNotFound", 404) {}`)
  and are mapped in exactly one place, `apps/api/src/on-error.ts`. Services never import
  `hono/http-exception`.
- **R8** Crons build the same container and call the same service methods. If a cron cannot reach
  a use case, the use case is in the wrong file.
- **§8.4** `traced()` is applied once per service and once per repo, in `container.ts`, and
  nowhere else. Span names are `<Module>.<method>`, produced mechanically — there is no string to
  mistype. Log messages are dotted event slugs (`auth.otp.issued`); the two are deliberately not
  the same string so nobody joins them.

## Adding a module

Ten steps, left to right; steps 1–7 never mention Hono. `Profiles` is the worked example in the
tree — copy its shape. The long form is in [README.md](README.md#adding-a-module):

```
Domain/<Thing>.ts → <Thing>/Contract.ts → <Thing>/Errors.ts → schema/<things>.ts + db:generate
  → <Plural>Repo.ts → Policy.ts → <Plural>Service.ts → Http.ts
  → container.ts + app.ts (+ openapi.ts tag) → <Plural>.test.ts + <Plural>.http.test.ts
```

Adding an *endpoint* to an existing module is the same list minus the files that already exist:
a route in `Contract.ts`, an error class if it has a new failure, a repo method, a service method,
one line in `Http.ts`, and a case in `<Plural>.test.ts`. Nothing in `apps/api` changes.

A module that calls an outside provider (transcription, an LLM, a calendar) declares a port and
gets a deterministic fake, selected by environment in `container.ts` — the rules are
[docs/architecture/PROVIDER-FAKES.md](docs/architecture/PROVIDER-FAKES.md), and
`Integrations/FeatureFlags` is the pattern in the tree today.

## Conventions you will get wrong if you guess

- **Timestamps are plain `integer()` epoch milliseconds, UTC**, not drizzle's `timestamp_ms` mode
  and not `Date`. That is what makes `fixedClock(1_700_000_000_000)` give exact expiry tests. The
  one exception is better-auth's generated tables, which use `timestamp_ms`; the repository that
  reads them converts at the boundary (`ProfilesRepo`).
- **Every version is exact.** No `^`, no `~`, except the deliberate `~` entries (`@types/react`
  and everything Expo owns). syncpack fails `bun run check` otherwise. Do not bump a version to
  fix a type error — say so instead.
- **Object keys inside a `sqliteTable` are alphabetical.** Biome's `useSortedKeys` assist enforces
  it, which is why a new column cannot land in the wrong place.
- **A new domain table goes into `RESET_ORDER`** (`packages/db/src/reset-order.ts`, children before
  parents), or state leaks between E2E runs.
- **Comments explain why, never what.** This repo is read as a reference. A comment that restates
  the line above it is deleted in review; a comment that records the trade-off a guard is making
  is the reason the file is worth reading.
- **`packages/db/src/schema/auth.ts` is generated.** Run `bun run auth:generate-schema`; never hand-edit it.
- **`betterAuth` is imported from `better-auth/minimal`**, never the barrel — the barrel drags
  kysely into the Worker bundle with no error and about 648 KiB of dead weight.
- **The app is iPhone-only.** `apps/native/app.json` declares `platforms: ["ios"]` and no tablet
  support. Maestro selects by `testID`, so every screen root and every control a flow touches gets
  one (`<screen>-<thing>`, e.g. `welcome-email`).

## Testing

- `<Plural>.test.ts` imports the **service**, never the router, and constructs it directly with
  the real repository over `makeTestD1()` (the shipped migrations in an in-memory SQLite),
  `fixedClock` and `sequentialIds` (D016). HTTP is covered once per context by a thin
  `<Plural>.http.test.ts` wire-shape test — not once per rule.
- Fake time, ids, actors and provider ports; do not fake the thing you are asserting about.
- `vitest.config.ts` is `{ environment: "node", globals: false, include: ["src/**/*.test.ts"] }`.
  `globals: false` is deliberate: every test file carries its own
  `import { describe, expect, it } from "vitest"`.
- The scenarios that must keep existing by name are listed in [docs/TESTING.md](docs/TESTING.md).

## Deploying

`bun run deploy:check` dry-runs BOTH deployed environments: it builds the bundle and resolves
every binding, and uploads nothing. That is the gate an agent may run.

`bun run deploy:dev` and `bun run deploy:prod` are real deploys — D1 migrations first, then the
Worker. **They are the user's call, never an agent's**, and so is any bare `wrangler deploy`, any
`git push`, and any EAS build or submit.
