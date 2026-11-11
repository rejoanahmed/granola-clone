# Modular Hono — the file you read instead of guessing

This is the architecture this repo is built on. Every other file in it is an instance of it, and
`bun run check` fails if any of them stops being one.

It is short on philosophy because it is meant to be checkable. §1 is a table of what each file may
import; §3 is eight rules; §7 is the lint rules and greps that make both mechanical.
If you are adding code here, §1 and §3 are the whole contract. §0 says which parts are load-bearing
and which are taste.

---

## 0. Why this shape

The shape exists to prevent one specific thing: a handler that has no seam. It looks like this,
and it is what a meeting-notes route becomes on its second week if nobody is watching.

```ts
// The shape this document exists to prevent. This repo contains nothing like it.
app.post("/notes/:noteId/transcribe", async (c) => {
  const db = drizzle(c.env.DB);
  const note = await db.select().from(notes).where(eq(notes.id, c.req.param("noteId"))).get();
  if (!note || note.status !== "recorded") throw new HTTPException(404);
  const job = await fetch("https://transcriber.example/jobs", { /* … c.env.TRANSCRIBE_KEY … */ });
  const retryAfter = Date.now() + 5 * 60_000;
  // …thirty more lines, three more tables, one LLM call, two more `c.env` reads
});
```

Nothing in it is declared. The database, the clock, the ownership rule, the retry window and the
transcription provider are all ambient. Three consequences follow, and they are the reason this
document is a specification rather than a preference:

1. **Nothing is testable in isolation.** The only seam is the HTTP boundary, so "does a second
   transcribe request start a second paid job?" becomes a question you can only answer by standing
   up D1 and a real provider. In practice that means it is never asked.
2. **Nothing is reusable.** The cron that retries stuck transcriptions cannot call the route's
   logic, so a second implementation of the same rule grows next to it — and then the two disagree
   about which states may be retried.
3. **Nothing is knowable.** To learn what a route touches you read all of it, and then all of what
   it imports.

The fix is not a framework. It is a factory function:

```ts
// packages/server/src/Profiles/Http.ts — the whole handler
export const profilesRouter = new OpenAPIHono<AppEnv>().openapi(getMeRoute, async (c) =>
  c.json(await c.var.svc.profiles.me(requireActor(c.var.actor)), 200)
);
```

One dependency, declared, injected. Everything a use case needs — the clock, the id generator, the
repository, the provider ports, the unit of work — arrives as a field of its `<X>Deps`, which is a
type you can read in ten seconds. **That property is the entire claim of this architecture.** It is
what an effect system gives you through its `R` channel, and it is reproducible in Hono for the
price of an argument.

The genuinely hard parts — D1 having no interactive transactions, and outside providers that cost
money, fail and retry — are hard regardless of architecture. What this shape buys is that each is
solved in one file, testable in milliseconds against an in-memory SQLite carrying the real
migrations and a fake provider, with nothing deployed. See `D1-NOTES.md` and `PROVIDER-FAKES.md`.

---

## 1. The mapping

Mechanical, no exceptions. A context named `Profiles` produces exactly these files and no others:

```
context "Profiles" ->  packages/domain/src/Domain/Profile.ts         schemas, FLAT and SINGULAR
                       packages/domain/src/Profile/Contract.ts       zod-openapi route definitions
                       packages/domain/src/Profile/Errors.ts         the context's error classes
                       packages/server/src/Profiles/ProfilesRepo.ts  repository is <Plural>Repo
                       packages/server/src/Profiles/Policy.ts
                       packages/server/src/Profiles/ProfilesService.ts   the use cases
                       packages/server/src/Profiles/Http.ts          the Hono sub-router
                       packages/server/src/Profiles/Profiles.test.ts
                       packages/server/src/Profiles/Profiles.http.test.ts
```

A context may own several domain schemas (a `Notes` context might own `Domain/Note.ts` and
`Domain/Segment.ts`).

Domain schemas are **singular** (`Domain/Profile.ts`), server folders are **plural**
(`server/src/Profiles/`). The asymmetry is deliberate: one file describes one thing, one folder
holds the use cases for many of them.

And no `ProfilesRepo.memory.ts`. A context gets one repository, the one that ships; the test suite
runs it against a migrated in-memory SQLite from `Testing/Database.ts` (D016), so there is no second
implementation of a `WHERE` clause to keep in step with the first.

The import rules are the whole architecture. They are worth more than the folder names:

| File | May import | May **not** import |
| --- | --- | --- |
| `packages/domain/src/Domain/*.ts` | `zod`, other `Domain/*` | anything in `packages/server` |
| `packages/domain/src/<Ctx>/Contract.ts` | `Domain/*`, `@hono/zod-openapi` | anything in `packages/server` |
| `packages/server/src/<Plural>/<Plural>Repo.ts` | `@kn/db`, `drizzle-orm`, `@kn/domain/*`, `../Runtime/*` | `hono`, other contexts' repos, any service |
| `packages/server/src/<Plural>/Policy.ts` | `@kn/domain/*`, `../Auth/Policy` | `@kn/db`, `drizzle-orm`, `hono` |
| `packages/server/src/<Plural>/<Plural>Service.ts` | `@kn/domain/*`, `./Policy`, its own `Deps` types (type-only imports of other repos allowed) | `@kn/db`, `drizzle-orm`, `hono`, `c.env`, `process.env` |
| `packages/server/src/<Plural>/Http.ts` | `hono`, `@hono/zod-openapi`, `@kn/domain/<Ctx>/Contract`, `../AppEnv` | `@kn/db`, any `*Repo`, any other context |
| `packages/server/src/container.ts` | everything | — |

Two of those carry the design: **`@kn/db` appears only in `*Repo.ts`, and `hono` never appears in
a service.** If both hold, the business logic is framework-free and database-free, which is the
entire claim an effect system makes with its `R` channel. `scripts/check-architecture.mjs` (§7)
fails `bun run check` if either breaks.

---

## 2. Effect → Hono, term by term

This repo contains no effect system and no `@effect/*` dependency. This table is here for two
readers: someone arriving from an Effect codebase who wants the dictionary, and someone here
wondering what was traded away (§6 answers the second question honestly).

| Effect | Hono equivalent, as used here |
| --- | --- |
| `Effect.Service` / `Context.Tag` | a factory function returning a plain object |
| `Layer` | one line inside `container.ts` |
| `yield* Profiles` | `deps.profiles` |
| `Layer.provide` | passing an argument |
| `Effect.gen` + `yield*` | `async` / `await` |
| `Data.TaggedError` + `Effect.fail` | `class ProfileNotFound extends appError("ProfileNotFound", 404) {}` + `throw` |
| the `R` channel | **nothing.** Replaced by lint rules — see §7 |
| the `E` channel | `AppError` subclasses, mapped once in `onError` |
| `Option<A>` | `A \| null` (repositories return `null`, never `undefined`) |
| `Schema` | `zod` (what `@hono/zod-openapi` already wants) |
| `HttpApiBuilder.group` | an `OpenAPIHono` sub-router |
| `Effect.forEach` / `Effect.all` | `Promise.all` |
| `Effect.withSpan` | the `traced()` wrapper, applied once in `container.ts` — §8.4 |
| `Effect.annotateSpans` | `span.setAttribute` |
| `Logger.json` + `annotateLogs` | `logEvent(slug, fields)` → `console.log(JSON.stringify(...))` |
| in-memory layers in tests | pass `makeProfilesRepo(makeDrizzle(makeTestD1()))` to the factory — the shipped repository over a migrated in-memory SQLite |
| a staging unit of work | the same object, plain: stage compiled statements, flush with `d1.batch()` |

Note the last row. D1 has no interactive transactions, so `Runtime/UnitOfWork.ts` is a hand-rolled
staging buffer over `D1Database.batch` in either world. Nothing about it is effect-specific.

---

## 3. The rules

### R1 · The contract is a file, and handlers are not in it

Route definitions — method, path, params, responses, OpenAPI metadata — live in
`packages/domain/src/<Ctx>/Contract.ts`. Keeping them in `packages/domain` is what lets
`@kn/apiclient` be *derived* from the contract instead of hand-written, and what lets `apps/native`
type-check against the API without depending on the Worker.

```ts
// packages/domain/src/Profile/Contract.ts
export const getMeRoute = createRoute({
  method: "get",
  path: "/me",
  responses: {
    200: json(Profile, "The caller's profile"),
    404: json(ErrorBody, "The session outlived its user"),
    ...commonErrors,
  },
  security: [{ sessionCookie: [] }],
  summary: "Who am I",
  tags: ["Profile"],
});
```

Route constants are named `<verb><Noun>Route`. That name is the contract: `Http.ts` imports it,
`@kn/apiclient` derives a method from it, and nothing renames it on the way through.

A contract file is worth nothing on its own — the first version of most projects has one and it
does not help, because the handler still holds the logic. The split only pays off alongside R3.

### R2 · The repository is the only thing that knows there is a database

One per context, constructed with a Drizzle client. Returns domain types, never rows. Returns
`null`, never `undefined`. No policy checks, no clock reads, no id generation.

```ts
// packages/server/src/Profiles/ProfilesRepo.ts, abridged
export const makeProfilesRepo = (db: DrizzleClient) => ({
  byId: async (id: UserId): Promise<Profile | null> => {
    const row = await db.select({ /* … */ }).from(user).where(eq(user.id, id)).get();
    return row === undefined ? null : toProfile(row);
  },
});
export type ProfilesRepo = ReturnType<typeof makeProfilesRepo>;
```

A repository that writes more than one statement atomically exposes `stage*` methods that add to a
unit of work instead of executing (`D1-NOTES.md` §2): a guarded transition is one statement whose
branch lives in the `WHERE`, because D1 cannot read a result and decide before the next write, and
`changes === 1` is how it reports that it won.

`ReturnType<typeof make…>` rather than a hand-written interface: one definition, so a service's
`deps` type follows the repository automatically and there is no second declaration to keep in step.

`DrizzleClient` is `Omit<DB, "batch" | "transaction">` on purpose. Transactions do not exist on D1,
and batching belongs to the unit of work, so the repository is handed a client that cannot reach
either.

### R3 · A service is a factory function whose dependencies are its argument

This is the load-bearing rule. Everything the service uses arrives through `deps` — including the
clock, the id generator and any provider port, which is what makes the tests deterministic.

```ts
// packages/server/src/Profiles/ProfilesService.ts
export type ProfilesDeps = {
  readonly repo: ProfilesRepo;
};

export const makeProfilesService = (deps: ProfilesDeps) => ({
  me: async (actor: Actor): Promise<Authorized<Profile>> => {
    const profile = await deps.repo.byId(actor.id);
    if (profile === null) {
      throw new ProfileNotFound({ id: actor.id });
    }
    return canReadProfile(profile, actor);
  },
});
export type ProfilesService = ReturnType<typeof makeProfilesService>;
```

Three constraints, all checked:

- **Every field is `readonly`.** `scripts/check-architecture.mjs` greps for it. A mutable dep is a
  dep somebody will reassign in a test and forget.
- **The factory is synchronous and constructs nothing.** Not the clock, not the ids, not an HTTP
  client. If a service needs async setup it needs a lazy getter instead, because the container is
  built per request.
- **`export type XService = ReturnType<typeof makeXService>` is the only service type.** There is
  no hand-written interface to keep in step.

The reason "constructs nothing" is absolute rather than a style note: `buildContainer` takes an
`overrides` argument, and an override can only reach a dependency that was passed in. A factory
that builds its own transcription client is a factory whose real path no test can replace — so the
production graph becomes the one path nothing exercises.

### R4 · Policy is a pure function, separate from the service

```ts
// packages/server/src/Profiles/Policy.ts
export const canReadProfile = make<Profile>(
  READ_PROFILE,
  (profile, actor) => profile.id === actor.id
);
```

Pure, synchronous, no I/O, no clock. `make` returns `Authorized<A>` — a branded value that throws
`Forbidden({ action })` when the predicate does not hold. A service method that forgets its check
fails to type-check where it passes the value on. That brand is the one piece of compile-time
enforcement that survives having no effect system, and it costs four lines.

Policy files never import `@kn/db` and never import `hono`. They take the subject they are deciding
about as a plain domain value — which means whatever the predicate compares (an owner id, say)
travels on the subject, so the policy never needs a repository.

### R5 · One composition root, and `env` appears nowhere else

`packages/server/src/container.ts` is the layer graph written as a function, and the only file in
`packages/server` allowed to read `Env`.

```ts
export const buildContainer = (env: Env, overrides: Partial<Container> = {}): Container => {
  const config = parseConfig(env);
  const db = makeDrizzle(env.DB);
  const clock = makeClock();
  const ids = makeIds();
  const uow = makeUnitOfWork(env.DB);

  const profilesRepo = traced("ProfilesRepo", makeProfilesRepo(db));
  const profiles = traced("Profiles", makeProfilesService({ repo: profilesRepo }));

  // FLAGS_MODE is read here and nowhere else, so local dev runs the real graph with a fake leaf.
  const flags = traced("FeatureFlags",
    env.FLAGS_MODE === "fake"
      ? makeFeatureFlagsFake({ on: env.FLAGS_ON?.split(",") })
      : makeFeatureFlagsClient({ flagship: env.FLAGS }));

  const e2e = config.e2e === null ? null : traced("E2E", makeE2eService({ /* … */ }));

  return { e2e, flags, profiles, ...overrides };
};
```

Every provider port follows the `flags` shape: the environment picks the implementation here, once,
and the service receives a port it cannot tell apart (`PROVIDER-FAKES.md`).

Mounted once, per request:

```ts
app.use("*", async (c, next) => {
  c.set("requestId", c.req.header("x-request-id") ?? c.req.header("cf-ray") ?? crypto.randomUUID());
  c.set("svc", buildContainer(c.env));
  await next();
});
```

The container is rebuilt per request. It is a handful of object literals and closures — no
connections, no warm-up — so the cost is nanoseconds and the benefit is that no request can ever
observe another request's state.

Cross-context calls follow one pattern. Context A does not import context B. A declares the *port
it needs* (a type, in its own folder, in its own vocabulary), and the container — the one file
allowed to know both — supplies a few-line adapter over B's service. The dependency graph stays a
DAG, and either side can be tested with a five-line object.

### R6 · Handlers are one expression

```ts
// packages/server/src/Profiles/Http.ts
export const profilesRouter = new OpenAPIHono<AppEnv>().openapi(getMeRoute, async (c) =>
  c.json(await c.var.svc.profiles.me(requireActor(c.var.actor)), 200)
);
```

If a handler contains a conditional, the branch belongs in a service. The review test is whether
the same operation could be invoked by a cron with no HTTP context — see R8. `requireActor` is not
a branch in that sense: it is the one shared question "is there a signed-in caller", asked the same
way by every router, and it throws `Unauthorized` rather than returning.

A handler that does not answer JSON (a redirect back into the app after an OAuth hop, say) is still
one expression, and the decision about *where* to redirect is made by the service.

### R7 · Errors are typed and mapped exactly once

```ts
// packages/domain/src/Profile/Errors.ts
export class ProfileNotFound extends appError("ProfileNotFound", 404) {}
```

```ts
// apps/api/src/on-error.ts
export const onError: ErrorHandler<AppEnv> = (err, c) =>
  isAppError(err)
    ? c.json({ _tag: err._tag, details: err.details, message: err.message }, err.status)
    : (console.error(err), c.json({ _tag: "Internal", message: "Internal" }, 500));
```

The status code is a property of the domain error, declared next to it. Services never import
`hono/http-exception` — they cannot, the linter stops them — so a status can never be decided in
two places and drift. `details` carries the machine-readable payload (`ProfileNotFound` carries the
id), and the client branches on `_tag` without parsing a message string.

### R8 · Crons, queues and anything else build the same container

There is no cron yet. When the first recurring job arrives it looks like this:

```ts
// apps/api/src/worker.ts
export default {
  fetch: app.fetch,
  scheduled: async (_event, env, ctx) => {
    const svc = buildContainer(env);
    ctx.waitUntil(svc.notes.retryStuckTranscriptions(100));
  },
} satisfies ExportedHandler<Env>;
```

plus a `triggers.crons` entry in **every** `env` block of `wrangler.jsonc`, which wrangler does not
inherit.

This is the rule that deletes the duplicate-implementation class of bug. The cron that retries a
stuck job calls the same service method a user's retry button calls, so the two can never disagree
about what retrying means. If a cron cannot reach a use case, the use case is in the wrong file.

Note also what the cron does *not* do: it never touches a repository, never opens a unit of work,
and never reads `env` beyond handing it to `buildContainer`. It composes use cases. Sequencing two
services is the caller's job, and the cron is a caller.

---

## 4. Testing

The shipped repository over a real SQLite is the whole story. No `wrangler dev`, no mocking library,
and no second implementation of anything.

```ts
const d1 = makeTestD1();               // packages/db/d1-migrations/*.sql, applied. Foreign keys ON.
await seedD1(d1, [{ rows: [userRow(actor())], table: "user" }]);

const svc = makeProfilesService({ repo: makeProfilesRepo(makeDrizzle(d1)) });

await expect(svc.me(otherActor())).rejects.toBeInstanceOf(ProfileNotFound);
```

Three rules keep this honest:

- **`Profiles.test.ts` imports `ProfilesService`, not the router.** HTTP is covered once per context
  by a thin wire-shape test (`Profiles.http.test.ts`), not per rule.
- **The seam is `deps`, not the thing behind it.** `ProfilesService` still imports no `@kn/db` and
  still cannot tell what its repo is backed by. Handing it the real repository changes what the
  assertion is worth, not whether the architecture holds.
- **The guard under test is the statement that ships.** A `WHERE` precondition, a `CHECK`, a unique
  or partial index is SQLite's answer here, not a re-statement in TypeScript — and constraints that
  live only in the DDL can be provoked at all. Fake time, ids, actors and provider ports; do not
  fake the thing you are asserting about.

Full detail, including the minimum scenario list every context must cover by name, is in
`docs/TESTING.md`.

---

## 5. A new context, start to finish

### The ten steps

Written against a hypothetical **Notes** context, since that is the product's first one.

1. **`packages/domain/src/Domain/Note.ts`** — zod schemas, flat and singular. No server imports.
2. **`packages/domain/src/Note/Contract.ts`** — the routes, no handlers. If a context has no HTTP
   surface at all (driven only by a cron or another context), skip this file and skip step 8 and the
   mount. A context is not required to be reachable over HTTP.
3. **`packages/domain/src/Note/Errors.ts`** — one class per failure, each carrying its status:
   `NoteNotFound` (404), `TranscriptionUnavailable` (502).
4. **`packages/db/src/schema/notes.ts`, then `bun run db:generate`** — the table, its `CHECK`s and
   its indexes, regenerated into `d1-migrations/*.sql`; add it to the schema barrel and to
   `RESET_ORDER`. Before the repository, not after: the test harness applies those files verbatim
   (D016), so a column that exists only in the drizzle schema is a red test rather than a green
   suite and a broken deploy.
5. **`packages/server/src/Notes/NotesRepo.ts`** — Drizzle in, domain types out, `null` for absent,
   `stage*` methods for anything that must be atomic with another write. This is the only file in
   the context allowed to import `@kn/db`.
6. **`packages/server/src/Notes/Policy.ts`** — pure predicates, branded results.
7. **`packages/server/src/Notes/NotesService.ts`** — `makeNotesService(deps)`. No `hono`, no
   `@kn/db`, every dep `readonly`.
8. **`packages/server/src/Notes/Http.ts`** — one expression per route, exported as `notesRouter`.
9. **Register in `container.ts`** — construct the repo, wrap both in `traced()`, add the service
   under a key (`notes`), and mount the router in `apps/api/src/app.ts`.
10. **`Notes.test.ts`** — against the service, over `makeTestD1()` with the real repository, a
    `fixedClock` and the fake provider ports. Plus `Notes.http.test.ts` if step 2 produced routes.

Steps 1–7 never mention Hono. That is the point: the framework is reachable from ten lines of
`Http.ts` and one middleware, so replacing it is a day's work rather than a rewrite.

### The part that is actually interesting: the port

Transcription, summarising and calendar sync each mean an outbound call to something that costs
money, can fail, retry and duplicate. Each gets the same treatment. Sketched for email, the smallest
case (sign-in OTPs need one):

```ts
// packages/server/src/Integrations/Email/Port.ts
export type EmailPort = {
  send(i: {
    readonly idempotencyKey: string;
    readonly subject: string;
    readonly to: string;
    readonly body: string;
  }): Promise<{ readonly accepted: boolean; readonly providerId: string | null }>;
};
```

Four properties to carry across, each of which `Integrations/FeatureFlags/` already demonstrates
in part:

- **The port is a type in the consuming context's folder**, or beside the integration when several
  contexts share it — never a provider SDK type leaking into a service.
- **There is a deterministic fake** (`makeEmailFake`) that records its calls, and the container
  picks it from config — not from `NODE_ENV`, and not through a test-only seam. The fake is the
  implementation local dev and E2E use. `PROVIDER-FAKES.md` is the full pattern.
- **The idempotency key is computed by the caller**, from data that is already stable (a note id,
  a job id), so a retried call is a no-op at the provider rather than a second charge.
- **A transport failure is a typed error** (502) and leaves a row the sweeper can find. Nothing is
  fire-and-forget.

And then wire the retry into a cron, not into the request path. A recording is saved whether or not
the transcription provider is up, because saving is a database transition and transcribing is a
separate, retryable fact.

---

## 6. What you give up

Stated plainly, because a document that only lists benefits is marketing.

| An effect system gives you | Hono + this shape gives you |
| --- | --- |
| A missing dependency is a **compile error** (`R` is unsatisfied) | A missing dependency is `undefined` at runtime, caught by the test that exercises the path |
| The set of effects a function performs is **in its type** | Discoverable by reading its `Deps` type — accurate only if R3 holds |
| Unhandled error cases are a **compile error** (`E` is exhaustive) | A missed `instanceof` falls through to the 500 branch |
| Interruption, retries, timeouts and resource safety as primitives | `AbortSignal`, and whatever you hand-roll |
| Structured concurrency across the request | `Promise.all` and care |
| Named application spans, one hand-written call at a time | every service and repository method spanned by one wrapper — §8 |
| A runtime whose semantics you must learn before reading any file | `async`/`await`, which every TypeScript reader already knows |

The compile-time properties in the first three rows are the real loss and there is no substitute
for them. Three things reduce the damage, and none of them fully replaces what was lost:

- `Authorized<A>` (R4) keeps authorisation compile-checked, because that is the one place where
  forgetting is a security bug rather than a 500.
- The test harness runs the **shipped** repositories against the **shipped** migrations, so the
  suite cannot rot into agreement with a fake: a repository that drifts from the schema fails a
  test rather than passing against a double that drifted with it (D016).
- §7's greps keep the import table mechanical rather than aspirational.

What is *not* recovered: nothing tells you that `ProfilesService.me` can throw `ProfileNotFound`
except `Profile/Errors.ts` and the test that provokes it. Write that test.

---

## 7. Enforcement

Conventions without a linter decay in about a month. An effect system enforces §1's import table
through the type system; here it has to be mechanical.

Half of it is Biome, in `biome.jsonc`:

```jsonc
"overrides": [
  {
    "includes": ["packages/server/src/**/*Service.ts", "packages/server/src/**/Policy.ts"],
    "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error", "options": { "paths": {
      "@kn/db": "Services never touch the database. Put the query in <Plural>Repo.ts.",
      "drizzle-orm": "Services never touch the database. Put the query in <Plural>Repo.ts.",
      "hono": "Services are framework-free. Take the value as a parameter."
    } } } } } }
  },
  {
    "includes": ["packages/server/src/**/Http.ts"],
    "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error", "options": { "paths": {
      "@kn/db": "Handlers read c.var.svc, never the database."
    } } } } } }
  }
]
```

The other half is four checks the linter cannot express, in `scripts/check-architecture.mjs`:

1. **`c.env` / `process.env` outside `container.ts` and `Runtime/*`** — *"Env is read in
   container.ts and Runtime/\* only (R5)."*
2. **A `*Repo` imported as a value by anything other than `container.ts` and a `*.test.ts`** —
   *"Repositories are constructed in container.ts. Take the repo as a dep (R3)."* A type-only
   import (`import type { ProfilesRepo }`) is allowed everywhere, which is exactly how a service
   names a cross-context repository dependency without being able to construct one.
3. **`readonly` on every field of every `*Deps` type** — *"Deps are readonly (R3)."*
4. **`@kn/db` outside `*Repo.ts`, `Runtime/Drizzle.ts`, `packages/auth` and `packages/db`** —
   *"@kn/db is imported by <Plural>Repo.ts and Runtime/Drizzle.ts only (R2)."*

Wired into the one command that gates everything:

```
bun run check
  = ultracite check --diagnostic-level=error
  && bun run syncpack:lint
  && node scripts/check-architecture.mjs
  && bun run check-types
```

Neither half is optional. Without them §1's table is a comment.

---

## 8. Observability

Spans are the one thing people assume an effect system is required for. It is the opposite: **the
traces in the Cloudflare dashboard are a runtime feature, and this shape gets them for one wrapper
call per service.**

### 8.1 What actually produces the traces

`apps/api/wrangler.jsonc` turns on Cloudflare's own tracing:

```jsonc
"observability": {
  "enabled": false,
  "logs": { "enabled": true, "invocation_logs": true, "head_sampling_rate": 1 },
  "traces": { "enabled": true, "persist": true, "head_sampling_rate": 1 }
}
```

What is drawn in the dashboard is workerd's instrumentation of the invocation, its subrequests, and
its D1 calls. No SDK produces it, and no framework choice changes it. This repo ships no OTLP
exporter and no `@opentelemetry/*` dependency; if you want one, §8.7.

> The outer `"enabled": false` with nested blocks true is copied deliberately and is one of the
> things `docs/DECISIONS.md` says to verify (D012). Do not "fix" the outer flag.

### 8.2 The part you have to build, and what it usually costs

The runtime gives you invocation and subrequest spans. What it cannot give you is *application*
spans — the `Profiles.me` and `NotesRepo.stageTransition` names that make a trace readable.

The usual way to get those is to annotate each method by hand. That approach is not wrong, it is
just expensive in a way that only shows up later: the codebase this architecture was extracted from
had 632 hand-written span annotations, five competing naming conventions among them, and a
decision log entry about the cost of unifying them after the fact. Every one of those was typed by
a person, and every one could be mistyped, forgotten or renamed out of step.

| | Hand-written spans | This shape |
| --- | --- | --- |
| Invocation, subrequest, D1 spans | from workerd | from workerd — identical |
| Named application spans | one call per method, forever | §8.4, one call per service |
| Parent/child nesting without threading a context | runtime-dependent | `tracing.enterSpan`, automatic |
| Span closed on success **and** on failure | whatever each author wrote | one `finally`, written once |
| Naming consistency | a convention people follow | mechanical — there is no string to mistype |

### 8.3 `tracing` from `cloudflare:workers`

workerd exposes a user-span API, in the types this repo already installs:

```ts
interface Tracing {
  enterSpan<T, A extends unknown[]>(name: string, cb: (span: Span, ...args: A) => T, ...args: A): T;
  startActiveSpan<T, A extends unknown[]>(name: string, cb: (span: Span, ...args: A) => T, ...args: A): T;
}
declare abstract class Span {
  get isTraced(): boolean;
  setAttribute(key: string, value?: boolean | number | string): void;
  end(): void;
}
```

`startActiveSpan` takes a callback, so nesting is maintained by the runtime — which is why this
needs no `AsyncLocalStorage` threaded through every signature. Spans emitted this way land in the
same dashboard view as the runtime's own.

### 8.4 The trick: wrap once in the container

Because R3 makes every service a **plain object of functions**, the container is a choke point.
One wrapper instruments every method of every service and every repository:

```ts
// packages/server/src/Runtime/traced.ts
import { tracing } from "cloudflare:workers";

export const traced = <T extends object>(module: string, svc: T): T =>
  Object.fromEntries(
    Object.entries(svc).map(([name, value]) =>
      typeof value !== "function"
        ? [name, value]
        : [name, (...args: unknown[]) =>
            tracing.startActiveSpan(`${module}.${name}`, (span) => {
              const settle = (err?: unknown) => {
                if (err) {
                  span.setAttribute("error", true);
                  span.setAttribute("error.type", (err as AppError)?._tag ?? "Unknown");
                }
                span.end();
              };
              try {
                const out = (value as (...a: unknown[]) => unknown)(...args);
                if (out instanceof Promise) {
                  return out.then(
                    (v) => { settle(); return v; },
                    (e) => { settle(e); throw e; }
                  );
                }
                settle();
                return out;
              } catch (e) { settle(e); throw e; }
            })]
    )
  ) as T;
```

Applied in `container.ts`, one word per object:

```ts
const profilesRepo = traced("ProfilesRepo", makeProfilesRepo(db));
const profiles = traced("Profiles", makeProfilesService({ repo: profilesRepo }));
```

Four things follow, and the last is the reason this section is not a downgrade:

1. **Every public method of every service and repository is spanned**, including the ones nobody
   would have remembered to annotate.
2. **`<Module>.<method>` in the casing of the exported identifier** is produced mechanically. It
   cannot drift, because there is no string to mistype. Module names today are exactly `Profiles`,
   `ProfilesRepo`, `FeatureFlags`, `E2E` and `E2eRepo`; each new context adds its service and its
   repository, and nothing else.
3. **Repository spans come free**, so a slow endpoint decomposes into its queries without a second
   instrumentation pass — which is how you find out where a request actually spends its time.
4. **The sync path is preserved.** `stage*` methods return a `StatementRef` synchronously; the
   wrapper's non-Promise branch covers them without turning them into promises, which would break
   the unit of work.

The cost is that a span boundary is now exactly a service-method boundary. Spanning a block
*inside* a method needs an explicit `tracing.enterSpan` in the body — fine, and rare, because a
method doing three interesting things is a method that wants splitting anyway.

### 8.5 Request id and logs

The request id rule — `x-request-id`, else `cf-ray`, else generate — lives in the same middleware
that builds the container (§R5), and goes on the context rather than in a fiber.

For logs, `Runtime/Logger.ts` is one function:

```ts
export const logEvent = (slug: string, fields: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ slug, ...fields }));
```

Workers Logs already associates console output with the invocation, so log↔trace correlation is
done by the platform.

One naming rule, worth keeping because violating it is tempting: **log messages are dotted event
slugs (`auth.otp.issued`, `request.failed`), span names are `<Module>.<method>`, and the two are
deliberately not the same string** so nobody builds a query that joins them.

### 8.6 Two things to verify before relying on this

Both are cheap, and neither is settled by reading types. They are D011 and D012 in
`docs/DECISIONS.md`:

- **Whether `startActiveSpan` ends the span itself when the callback returns**, or only on an
  explicit `end()`. The wrapper calls `end()` on every path, which is correct if the runtime does
  not — and produces duplicated spans if it does. Check one trace in the dashboard.
- **Whether `observability.enabled: false` suppresses the nested `traces` block.** The nested
  blocks each carry their own `enabled`; the shape in §8.1 is copied from a deployment where traces
  demonstrably work, but that is inference from a dashboard, not from a schema.

### 8.7 If you want a real OTel backend instead

`@microlabs/otel-cf-workers` is the Workers-targeted SDK and auto-instruments fetch and D1 calls.
The `traced` wrapper becomes a thin call into `@opentelemetry/api` instead of `cloudflare:workers`,
and the `<Module>.<method>` naming is unchanged. Nothing in §1–§7 moves. It is not a dependency
here because an unexported span is worth less than no span, and there is nowhere to export to yet.

---

## 9. Where the hard parts are

This document describes the shape. The companion files describe the problems the shape is arranged
around, and they are not optional reading before changing anything in `packages/server`:

| File | What it settles |
| --- | --- |
| `D1-NOTES.md` | Batch semantics, the bound-parameter arithmetic behind the chunk sizes, and what D1 will not do for you. Read it before writing a `WHERE` clause that guards anything. |
| `PROVIDER-FAKES.md` | How transcription, LLM, calendar and other paid providers are ported, faked by environment, and tested — the seam every outside call goes through. |
| `DEPLOYMENT.md` | One branch and why flags replace the others, the pipeline and its promotion gate, the three rollback tiers with their commands, and the expand/contract rules D1's missing rollback forces. Read it before writing a migration. |
| `../DECISIONS.md` | Why the test doubles were deleted (D016), why promotion is automatic (D017), and the open items that need verifying against real infrastructure. |
| `../TESTING.md` | The real-SQLite harness and what it does and does not model, the wire-shape test pattern, the minimum scenarios by name, and the E2E gate. |

The standing design rule, which resolves ambiguities none of those cover: **every failure mode is
arranged so that nothing is lost and nothing is paid for twice.** If the choice is between a
recording briefly shown as "still processing" when it is done, and a second paid transcription of
the same audio, choose the first, every time.
