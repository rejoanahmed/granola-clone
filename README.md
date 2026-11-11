# granola-clone — Notes

The backend and iPhone app for **Notes**, a meeting-notes app: record a meeting, get a transcript
and AI-written notes, tied to your calendar. **None of that is built yet.** This repository is at
the bootstrap stage — what exists is the architecture the features will be built on, sign-in, the
gate, CI, and one example module (`GET /me`) that demonstrates the module pattern end to end.

**It ships as bring-your-own-server** (D019): every user deploys this backend into their own
Cloudflare account with `bun run selfhost` and pairs the iPhone app with it, so no recording ever
reaches a server the developer runs. [SELF-HOSTING.md](SELF-HOSTING.md) is the user's guide;
[docs/plan/RELEASE.md](docs/plan/RELEASE.md) is the path to the App Store. The name is not chosen
yet: it is one object, `packages/domain/src/Brand.ts` (D023).

The architecture is modular Hono on Cloudflare Workers with no effect system, described in
[docs/architecture/README.md](docs/architecture/README.md). It was cut from an event-ticketing
template; the ticketing domain is gone, the shape is kept.

---

## The architecture, in ten lines

```
Domain/<Thing>.ts      zod schemas. Flat, singular, no I/O.             packages/domain
<Thing>/Contract.ts    createRoute definitions. No handlers.            packages/domain
<Thing>/Errors.ts      one class per failure, each carrying its status. packages/domain
<Plural>Repo.ts        the only file that knows there is a database.    packages/server
Testing/Database.ts    the migrated SQLite every service test runs on.  packages/server
Policy.ts              pure predicates returning Authorized<A>.         packages/server
<Plural>Service.ts     make<X>Service(deps) — the use cases. No hono.   packages/server
Http.ts                one expression per route.                        packages/server
container.ts           the composition root. The only reader of Env.    packages/server
worker.ts              fetch (and later scheduled), both on that root.   apps/api
```

Two rules carry the design: **`@kn/db` appears only in `*Repo.ts`, and `hono` never appears in a
service.** `bun run check` fails if either breaks — Biome covers the import paths,
[`scripts/check-architecture.mjs`](scripts/check-architecture.mjs) covers the placement.

## Layout

```
apps/
  api/                 the Worker: fetch, OpenAPI doc at /api/doc, Scalar at /api/reference   :3001
  native/              Expo app for iPhone (Kothanote) — connect, record, notes, Ask           Metro
  web/                 the landing page and /privacy: TanStack Start on a Worker (D033)       :3043
    .maestro/          UI flows on the iOS simulator
packages/
  domain/    @kn/domain     schemas, route contracts, error classes. Isomorphic; the app imports it.
  server/    @kn/server     services, repositories, policies, handlers, Runtime, provider ports
  db/        @kn/db         drizzle schema + D1 migrations + the deterministic seed
  auth/      @kn/auth       better-auth instance and its native client
  apiclient/ @kn/apiclient  the typed client derived from the contract
  tokens/    @kn/tokens     the palette: native reads it, apps/web reads its generated CSS (D031)
  shared/    @kn/shared     code two apps share: the privacy policy and its renderer
  e2e/       @kn/e2e        the promotion gate: HTTP journeys against deployed dev
  config/    @kn/config     the tsconfig presets every package extends
docs/
  architecture/        README (the spec), D1-NOTES, DEPLOYMENT, PROVIDER-FAKES
  DECISIONS.md         numbered rulings; ambiguity is resolved here, not re-litigated in code
  TESTING.md           the SQLite harness, wire-shape tests, the E2E gate, and Maestro
```

The one module is **Profiles** (`GET /me`). It appears once in `packages/domain` (as `Profile`)
and once in `packages/server` (as `Profiles`), which is the naming every module follows.

## Running it

```bash
bun install
bun run check                 # lint + syncpack + architecture + types — the one gate
bun run test                  # every package's unit suite

cd apps/api && bun run local:db:apply && cd ../..
cp apps/api/.dev.vars.example apps/api/.dev.vars   # then set BETTER_AUTH_SECRET
bun run db:seed               # two users with long-lived sessions, printed to the console
bun run dev:api               # the API on :3001

bun run e2e:ios               # build the dev client, run it on the "iPhone 17 Pro" simulator, start Metro
bun run maestro:smoke         # (second terminal) the Maestro smoke flow against that simulator
```

Email sign-in logs the one-time code to the `wrangler dev` output in development: no email
provider is wired yet.

| Command | What |
| --- | --- |
| `bun run dev` | the API and Metro |
| `bun run dev:api` / `dev:native` | one surface (native also starts the API) |
| `bun run check` | lint (ultracite/Biome) + syncpack + `check-architecture.mjs` + types |
| `bun run fix` | auto-fix the lint and version drift |
| `bun run test` | every package's suite |
| `bun run db:generate` / `db:migrate` / `db:seed` / `db:studio` | drizzle-kit, via `@kn/db` |
| `bun run auth:generate-schema` | regenerate `packages/db/src/schema/auth.ts` — never hand-edit it |
| `bun run e2e:ios` / `maestro:smoke` | the iOS simulator build and its Maestro smoke flow |

**Turbo caches `type-check`**, so a green run reading "8 cached" has verified nothing:

```bash
find . -name "*.tsbuildinfo" -not -path "*/node_modules/*" -delete && TURBO_FORCE=1 bun run check
```

## How it deploys

One branch. Feature branch → PR → CI → merge to `main`, and the merge deploys: verify, deploy dev
(D1 migrations first, then the Worker), the E2E suite against dev as the promotion gate, then
production. Unfinished work ships dark behind a Cloudflare Flagship flag. D1 has no rollback, so
every migration is expand/contract. [docs/architecture/DEPLOYMENT.md](docs/architecture/DEPLOYMENT.md)
is the full account. The hostnames in `wrangler.jsonc` are `*.kothanote.example.com` placeholders
until a real domain exists.

`bun run deploy:check` (a dry run of both environments) is the only deploy command an agent may
run. Real deploys, pushes and EAS builds are the owner's call.

## Adding a module

Ten files and no framework work. Work left to right; steps 1–7 never mention Hono. Say the module
is **Notes** (a meeting's written notes):

1. `packages/domain/src/Domain/Note.ts` — zod schemas, flat and singular.
2. `packages/domain/src/Note/Contract.ts` — `createRoute` definitions, named `<verb><Noun>Route`.
3. `packages/domain/src/Note/Errors.ts` — one class per actionable failure, each with its status:
   `export class NoteNotFound extends appError("NoteNotFound", 404) {}`.
4. `packages/db/src/schema/notes.ts`, then `bun run db:generate` — the table, alphabetical keys,
   indexes in the third argument; add it to the schema barrel and to `RESET_ORDER`.
5. `packages/server/src/Notes/NotesRepo.ts` — Drizzle in, domain types out, `null` for absent.
   Guards live in `WHERE` clauses; multi-row writes stage into a `UnitOfWork`.
6. `packages/server/src/Notes/Policy.ts` — pure predicates returning `Authorized<A>`.
7. `packages/server/src/Notes/NotesService.ts` — `makeNotesService(deps)`, every field of
   `NotesDeps` `readonly`, nothing constructed inside the factory, not even the clock.
8. `packages/server/src/Notes/Http.ts` — one expression per route.
9. Register it in `container.ts` (`notes: traced("Notes", makeNotesService({…}))`), mount
   `notesRouter` in `apps/api/src/app.ts`, add its tag to `apps/api/src/openapi.ts`, and add the
   client methods in `packages/apiclient`.
10. `packages/server/src/Notes/Notes.test.ts` — the service against the **real** repository over
    `makeTestD1()` and a `fixedClock` (D016) — plus a thin `Notes.http.test.ts`.

Then `bun run check`. If step 5's import of `@kn/db` leaked into step 8, or the repo is constructed
anywhere but `container.ts`, the check says so with a file and a line.

## Reference

| Document | What |
| --- | --- |
| [docs/architecture/README.md](docs/architecture/README.md) | The architecture, R1–R8, the import table, `traced()` |
| [docs/architecture/D1-NOTES.md](docs/architecture/D1-NOTES.md) | Batch semantics and the bound-param arithmetic |
| [docs/architecture/DEPLOYMENT.md](docs/architecture/DEPLOYMENT.md) | Trunk and flags, the pipeline, the rollback tiers, expand/contract, setup |
| [docs/architecture/PROVIDER-FAKES.md](docs/architecture/PROVIDER-FAKES.md) | How transcription, LLM and calendar providers are faked by environment |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Numbered rulings |
| [docs/TESTING.md](docs/TESTING.md) | The SQLite harness, wire-shape tests, the E2E gate, Maestro |
| [AGENTS.md](AGENTS.md) | The import rules and the module recipe, for coding agents |
