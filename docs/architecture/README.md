# Modular Hono — the file you read instead of guessing

This is the architecture gcnotes exists to teach. Every other file in this repository is an
instance of it, and `bun run check` fails if any of them stops being one.

It is short on philosophy because it is meant to be checkable. §1 is a table of what each file may
import; §3 is eight rules; §7 is the lint rules and greps that make both mechanical.
If you are adding code to gcnotes, §1 and §3 are the whole contract. If you are copying gcnotes
into a new product, read §0 first so you know which parts are load-bearing and which are taste.

---

## 0. Why this shape

The shape exists to prevent one specific thing: a handler that has no seam. It looks like this,
and it is what an event-ticketing route becomes on its second week if nobody is watching.

```ts
// The shape this document exists to prevent. gcnotes contains nothing like it.
app.post("/events/:eventId/registrations", async (c) => {
  const db = drizzle(c.env.DB);
  const event = await db.select().from(events).where(eq(events.id, c.req.param("eventId"))).get();
  if (!event || event.status !== "published") throw new HTTPException(404);
  const types = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, event.id));
  const total = types.reduce(/* pricing, inline */);
  const holdExpiresAt = Date.now() + 30 * 60_000;
  // …thirty more lines, three more tables, one bKash call, two `c.env` reads
});
```

Nothing in it is declared. The database, the clock, the pricing rule, the hold window and the
payment provider are all ambient. Three consequences follow, and they are the reason this document
is a specification rather than a preference:

1. **Nothing is testable in isolation.** The only seam is the HTTP boundary, so "does an
   oversell throw?" becomes a question you can only answer by standing up D1 and racing two
   requests at it. In practice that means it is never asked.
2. **Nothing is reusable.** The cron that expires abandoned holds cannot call the route's logic, so
   a second implementation of the same release rule grows next to it — and then the two disagree
   about whether a refunded registration returns its seats.
3. **Nothing is knowable.** To learn what a route touches you read all of it, and then all of what
   it imports.

The fix is not a framework. It is a factory function:

```ts
// packages/server/src/Tickets/Http.ts — the whole handler
export const ticketsRouter = new OpenAPIHono<AppEnv>().openapi(registerRoute, async (c) =>
  c.json(
    await c.var.svc.tickets.register(
      c.var.actor,
      c.req.valid("param").eventId,
      c.req.valid("json")
    ),
    201
  )
);
```

One dependency, declared, injected. Everything the registration rule needs — the clock, the id
generator, the events repository, the hold window, the unit of work — arrives as a field of
`TicketsDeps`, which is a type you can read in ten seconds. **That property is the entire claim of
this architecture.** It is what an effect system gives you through its `R` channel, and it is
reproducible in Hono for the price of an argument.

The two things that are genuinely hard in gcnotes — D1 having no interactive transactions, and
bKash's `executePayment` not being idempotent — are hard regardless of architecture. What this
shape buys is that both are solved in one file each, and that the solutions are testable in
milliseconds — against an in-memory SQLite carrying the real migrations, with nothing deployed. See
`CONCURRENCY.md` and `BKASH.md`.

---

## 1. The mapping

Mechanical, no exceptions. A context named `Tickets` produces exactly these files and no others:

```
context "Tickets"  ->  packages/domain/src/Domain/Ticket.ts        schemas, FLAT and SINGULAR
                       packages/domain/src/Domain/Registration.ts  (a context may own several)
                       packages/domain/src/Ticket/Contract.ts      zod-openapi route definitions
                       packages/domain/src/Ticket/Errors.ts        the context's error classes
                       packages/server/src/Tickets/TicketsRepo.ts  repository is <Plural>Repo
                       packages/server/src/Tickets/Policy.ts
                       packages/server/src/Tickets/TicketsService.ts    the use cases
                       packages/server/src/Tickets/Http.ts         the Hono sub-router
                       packages/server/src/Tickets/Tickets.test.ts
                       packages/server/src/Tickets/Tickets.http.test.ts
```

Domain schemas are **singular** (`Domain/Ticket.ts`), server folders are **plural**
(`server/src/Tickets/`). The asymmetry is deliberate: one file describes one thing, one folder
holds the use cases for many of them.

And no `TicketsRepo.memory.ts`. A context gets one repository, the one that ships; the test suite
runs it against a migrated in-memory SQLite from `Testing/Database.ts` (D016), so there is no second
implementation of a `WHERE` clause to keep in step with the first.

The import rules are the whole architecture. They are worth more than the folder names:

| File | May import | May **not** import |
| --- | --- | --- |
| `packages/domain/src/Domain/*.ts` | `zod`, other `Domain/*` | anything in `packages/server` |
| `packages/domain/src/<Ctx>/Contract.ts` | `Domain/*`, `@hono/zod-openapi` | anything in `packages/server` |
| `packages/server/src/<Plural>/<Plural>Repo.ts` | `@gc/db`, `drizzle-orm`, `@gc/domain/*`, `../Runtime/*` | `hono`, other contexts' repos, any service |
| `packages/server/src/<Plural>/Policy.ts` | `@gc/domain/*`, `../Auth/Policy` | `@gc/db`, `drizzle-orm`, `hono` |
| `packages/server/src/<Plural>/<Plural>Service.ts` | `@gc/domain/*`, `./Policy`, its own `Deps` types (type-only imports of other repos allowed) | `@gc/db`, `drizzle-orm`, `hono`, `c.env`, `process.env` |
| `packages/server/src/<Plural>/Http.ts` | `hono`, `@hono/zod-openapi`, `@gc/domain/<Ctx>/Contract`, `../AppEnv` | `@gc/db`, any `*Repo`, any other context |
| `packages/server/src/container.ts` | everything | — |

Two of those carry the design: **`@gc/db` appears only in `*Repo.ts`, and `hono` never appears in
a service.** If both hold, the business logic is framework-free and database-free, which is the
entire claim an effect system makes with its `R` channel. `scripts/check-architecture.mjs` (§7)
fails `bun run check` if either breaks.

---

## 2. Effect → Hono, term by term

gcnotes contains no effect system and no `@effect/*` dependency. This table is here for two
readers: someone arriving from an Effect codebase who wants the dictionary, and someone here
wondering what was traded away (§6 answers the second question honestly).

| Effect | Hono equivalent, as used here |
| --- | --- |
| `Effect.Service` / `Context.Tag` | a factory function returning a plain object |
| `Layer` | one line inside `container.ts` |
| `yield* Tickets` | `deps.tickets` |
| `Layer.provide` | passing an argument |
| `Effect.gen` + `yield*` | `async` / `await` |
| `Data.TaggedError` + `Effect.fail` | `class SoldOut extends appError("SoldOut", 409) {}` + `throw` |
| the `R` channel | **nothing.** Replaced by lint rules — see §7 |
| the `E` channel | `AppError` subclasses, mapped once in `onError` |
| `Option<A>` | `A \| null` (repositories return `null`, never `undefined`) |
| `Schema` | `zod` (what `@hono/zod-openapi` already wants) |
| `HttpApiBuilder.group` | an `OpenAPIHono` sub-router |
| `Effect.forEach` / `Effect.all` | `Promise.all` |
| `Effect.withSpan` | the `traced()` wrapper, applied once in `container.ts` — §8.4 |
| `Effect.annotateSpans` | `span.setAttribute` |
| `Logger.json` + `annotateLogs` | `logEvent(slug, fields)` → `console.log(JSON.stringify(...))` |
| in-memory layers in tests | pass `makeTicketsRepo(makeDrizzle(makeTestD1()))` to the factory — the shipped repository over a migrated in-memory SQLite |
| a staging unit of work | the same object, plain: stage compiled statements, flush with `d1.batch()` |

Note the last row. D1 has no interactive transactions, so `Runtime/UnitOfWork.ts` is a hand-rolled
staging buffer over `D1Database.batch` in either world. Nothing about it is effect-specific.

---

## 3. The rules

### R1 · The contract is a file, and handlers are not in it

Route definitions — method, path, params, responses, OpenAPI metadata — live in
`packages/domain/src/<Ctx>/Contract.ts`. Keeping them in `packages/domain` is what lets
`@gc/apiclient` be *derived* from the contract instead of hand-written, and what lets `apps/web`
and `apps/native` type-check against the API without depending on the Worker.

```ts
// packages/domain/src/Ticket/Contract.ts
export const registerRoute = createRoute({
  method: "post",
  path: "/events/{eventId}/registrations",
  tags: ["Registrations"],
  request: { params: z.object({ eventId: EventId }), body: jsonBody(CreateRegistration) },
  responses: {
    201: json(RegistrationDetail, "Seats held"),
    404: json(ErrorBody, "Event or ticket type not found"),
    409: json(ErrorBody, "Sold out, or the event is not purchasable"),
    ...commonErrors,
  },
});
```

Route constants are named `<verb><Noun>Route`. That name is the contract: `Http.ts` imports it,
`@gc/apiclient` derives a method from it, and nothing renames it on the way through.

A contract file is worth nothing on its own — the first version of most projects has one and it
does not help, because the handler still holds the logic. The split only pays off alongside R3.

### R2 · The repository is the only thing that knows there is a database

One per context, constructed with a Drizzle client. Returns domain types, never rows. Returns
`null`, never `undefined`. No policy checks, no clock reads, no id generation.

```ts
// packages/server/src/Events/EventsRepo.ts
export const makeEventsRepo = (db: DrizzleClient) => ({
  byId: async (id: EventId): Promise<Event | null> => { /* ... */ },

  /**
   * The seat claim. One statement, no read: the branch lives in the WHERE clause because D1
   * cannot read a result and decide before the next write. `changes === 1` won the seat.
   */
  stageClaim: (stage: Stage, line: PricedLine, at: Timestamp): StatementRef =>
    stage.add({ query: db.update(ticketTypes)./* … */ }),
});
export type EventsRepo = ReturnType<typeof makeEventsRepo>;
```

`ReturnType<typeof make…>` rather than a hand-written interface: one definition, so a service's
`deps` type follows the repository automatically and there is no second declaration to keep in step.

`StagedStatement` is a plain object — a Drizzle builder, compiled to SQL and parameters at flush
time. It was once a two-armed union so that a hand-written double could stage a `run()` thunk
alongside it; D016 deleted the doubles and the discriminant had nothing left to discriminate
(`D1-NOTES.md` §2).

`DrizzleClient` is `Omit<DB, "batch" | "transaction">` on purpose. Transactions do not exist on D1,
and batching belongs to the unit of work, so the repository is handed a client that cannot reach
either.

### R3 · A service is a factory function whose dependencies are its argument

This is the load-bearing rule. Everything the service uses arrives through `deps` — including the
clock, the id generator and the hold window, which is what makes the tests deterministic and the
expiry maths exact.

```ts
// packages/server/src/Tickets/TicketsService.ts
export type TicketsDeps = {
  readonly clock: Clock;
  /** The deliberate cross-module dependency. A TYPE-only import; the value is wired in container.ts. */
  readonly events: EventsRepo;
  readonly holdMinutes: number;
  readonly ids: Ids;
  readonly repo: TicketsRepo;
  readonly uow: UnitOfWork;
};

export const makeTicketsService = (deps: TicketsDeps) => ({
  cancel: async (id: RegistrationId, actor: Actor) => {
    const reg = await deps.repo.summaryById(id);
    if (!reg) throw new RegistrationNotFound({ id });
    canCancelRegistration(reg, actor);
    if (reg.status !== "pending") throw new RegistrationNotCancellable({ id, status: reg.status });
    // ...
  },
});
export type TicketsService = ReturnType<typeof makeTicketsService>;
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
that builds its own bKash client is a factory whose real path no test can replace — so the
production graph becomes the one path nothing exercises.

### R4 · Policy is a pure function, separate from the service

```ts
// packages/server/src/Tickets/Policy.ts
export const canCheckIn = make<TicketWithEvent>(
  CHECK_IN,
  (ticket, actor) => ticket.event.organiserId === actor.id
);
```

Pure, synchronous, no I/O, no clock. `make` returns `Authorized<A>` — a branded value that throws
`Forbidden({ action })` when the predicate does not hold. A service method that forgets its check
fails to type-check where it passes the value on. That brand is the one piece of compile-time
enforcement that survives having no effect system, and it costs four lines.

Policy files never import `@gc/db` and never import `hono`. They take the subject they are
deciding about as a plain domain value.

### R5 · One composition root, and `env` appears nowhere else

`packages/server/src/container.ts` is the layer graph written as a function, and the only file in
`packages/server` allowed to read `Env`.

```ts
export const buildContainer = (env: Env, overrides: Partial<Container> = {}) => {
  const config = parseConfig(env);
  const db = makeDrizzle(env.DB);
  const clock = makeClock();
  const ids = makeIds();
  const uow = makeUnitOfWork(env.DB);

  const eventsRepo = traced("EventsRepo", makeEventsRepo(db));
  const ticketsRepo = traced("TicketsRepo", makeTicketsRepo(db));
  const paymentsRepo = traced("PaymentsRepo", makePaymentsRepo(db));

  const events = traced("Events", makeEventsService({ clock, ids, repo: eventsRepo }));
  const tickets = traced("Tickets", makeTicketsService({
    clock, events: eventsRepo, holdMinutes: config.holdMinutes, ids, repo: ticketsRepo, uow,
  }));

  // BKASH_MODE is read here and nowhere else, so E2E runs the real graph with a fake leaf.
  const bkash = config.bkash.mode === "fake"
    ? makeBkashFake({ clock, ids })
    : makeBkashClient({ ...config.bkash, tokens: env.KV });

  const payments = traced("Payments", makePaymentsService({
    bkash,
    callbackUrl: config.bkash.callbackUrl,
    clock,
    // The adapter: Payments' vocabulary, Tickets' implementation. Five lines, in the one file
    // allowed to know both. This is what keeps Payments -> Tickets -> Events acyclic.
    fulfilment: {
      confirm: (id, paymentId) => tickets.confirm(id, paymentId),
      release: (id, reason) => tickets.release(id, reason),
      summary: (id) => tickets.summary(id),
    },
    ids,
    repo: paymentsRepo,
    staleAfterMs: config.paymentStaleMinutes * 60_000,
  }));

  return { events, payments, tickets, ...overrides };
};
export type Container = ReturnType<typeof buildContainer>;
```

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

Read the `fulfilment` adapter above once more, because it is the pattern for every cross-context
call. Payments does not import Tickets. Payments declares the *port it needs*
(`RegistrationFulfilment`, three methods, in its own folder), and the container — the one file
allowed to know both — supplies it. The dependency graph stays a DAG, and either side can be
tested with a five-line object.

### R6 · Handlers are one expression

```ts
// packages/server/src/Events/Http.ts
export const eventsRouter = new OpenAPIHono<AppEnv>()
  .openapi(listEventsRoute, async (c) =>
    c.json(await c.var.svc.events.listPublished(c.req.valid("query"))))
  .openapi(publishEventRoute, async (c) =>
    c.json(await c.var.svc.events.publish(c.req.valid("param").eventId, c.var.actor)));
```

If a handler contains a conditional, the branch belongs in a service. The review test is whether
the same operation could be invoked by a cron with no HTTP context — see R8.

There is exactly one handler in gcnotes that does not return JSON: the bKash redirect callback
returns `c.redirect(...)`. It is still one expression, and the decision about *where* to redirect
is made by the service, not by the handler.

### R7 · Errors are typed and mapped exactly once

```ts
// packages/domain/src/Ticket/Errors.ts
export class SoldOut extends appError("SoldOut", 409) {}
export class TicketAlreadyCheckedIn extends appError("TicketAlreadyCheckedIn", 409) {}
export class TicketVoid extends appError("TicketVoid", 410) {}
```

```ts
// apps/api/src/on-error.ts
app.onError((err, c) =>
  err instanceof AppError
    ? c.json({ _tag: err._tag, message: err.message, details: err.details }, err.status)
    : (console.error(err), c.json({ _tag: "Internal", message: "Internal" }, 500))
);
```

The status code is a property of the domain error, declared next to it. Services never import
`hono/http-exception` — they cannot, the linter stops them — so a status can never be decided in
two places and drift. `details` carries the machine-readable payload: `SoldOut` names the ticket
type ids that lost, `TicketAlreadyCheckedIn` carries the first scan's time, and the client renders
both without parsing a message string.

### R8 · Crons, queues and anything else build the same container

```ts
// apps/api/src/worker.ts
export default {
  fetch: app.fetch,
  scheduled: async (_event, env, ctx) => {
    const svc = buildContainer(env);
    ctx.waitUntil((async () => {
      await svc.tickets.sweepExpiredHolds(200);
      await svc.payments.sweepStale(100);
      const { refundable } = await svc.tickets.sweepCancelledEvents(200);
      for (const id of refundable) {
        await svc.payments.refundForRegistration(id, "event_cancelled");
      }
    })());
  },
} satisfies ExportedHandler<Env>;
```

This is the rule that deletes the duplicate-implementation class of bug. The cron that returns
expired seats calls `TicketsService.release` — the same method the attendee's cancel button calls,
with a different reason — so the two can never disagree about what releasing means. If a cron
cannot reach a use case, the use case is in the wrong file.

Note also what the cron does *not* do: it never touches a repository, never opens a unit of work,
and never reads `env` beyond handing it to `buildContainer`. It composes use cases. The
`refundable` loop is the only place in gcnotes where two services are sequenced by a caller, and
it is three lines in the one file allowed to do it.

---

## 4. Testing

The shipped repository over a real SQLite is the whole story. No `wrangler dev`, no mocking library,
and no second implementation of anything.

```ts
const d1 = makeTestD1();               // packages/db/d1-migrations/*.sql, applied. Foreign keys ON.
await seedD1(d1, [
  { rows: [userRow], table: "user" },
  { rows: [eventRow], table: "events" },
  { rows: [aTicketType({ quantity_total: 1 })], table: "ticket_types" },
]);

const db = makeDrizzle(d1);
const svc = makeTicketsService({
  repo: makeTicketsRepo(db),
  events: makeEventsRepo(db),
  clock: fixedClock(1_700_000_000_000),
  ids: sequentialIds(),
  holdMinutes: 30,
  uow: makeUnitOfWork(d1),
});

await expect(svc.register(attendee, eventId, twoSeats)).rejects.toBeInstanceOf(SoldOut);
```

Three rules keep this honest:

- **`Tickets.test.ts` imports `TicketsService`, not the router.** HTTP is covered once per context
  by a thin wire-shape test (`Tickets.http.test.ts`), not per rule.
- **The seam is `deps`, not the thing behind it.** `TicketsService` still imports no `@gc/db` and
  still cannot tell what its repo is backed by. Handing it the real repository changes what the
  assertion is worth, not whether the architecture holds.
- **The guard under test is the statement that ships.** `expect(refs).toEqual([1, 0])` used to be a
  claim about a `quantityClaimed + q > quantityTotal` written a second time in TypeScript; it is now
  SQLite's own answer to the `WHERE quantity_claimed + :q <= quantity_total` that deploys — and the
  `CHECK` constraints and the partial unique index, which live only in the DDL, can be provoked at
  all. Fake time, ids, actors and the bKash port; do not fake the thing you are asserting about.

Full detail, including the minimum scenario list every context must cover by name, is in
`docs/TESTING.md`.

---

## 5. A new context, start to finish

gcnotes ships three contexts: Events, Tickets, Payments. This section is the recipe for the
fourth. It is written as a worked example — **Notifications**, sending a ticket to the attendee's
email — because that is the extension the template most obviously wants and deliberately does not
ship (see the end of this section for why).

### The ten steps

1. **`packages/domain/src/Domain/Notification.ts`** — zod schemas, flat and singular.
   `NotificationChannel`, `Notification`, `NotificationStatus`. No server imports.
2. **`packages/domain/src/Notification/Contract.ts`** — the routes, no handlers. If the context has
   no HTTP surface at all (plausible here: it may be driven only by Payments and the cron), skip
   this file and skip steps 8 and the mount. A context is not required to be reachable over HTTP.
3. **`packages/domain/src/Notification/Errors.ts`** — one class per failure, each carrying its
   status: `NotificationNotFound` (404), `ChannelUnavailable` (502).
4. **`packages/db/src/schema/notification.ts`, then `bun run db:generate`** — the table, its
   `CHECK`s and its indexes, regenerated into `d1-migrations/*.sql`. Before the repository, not
   after: the test harness applies those files verbatim (D016), so a column that exists only in the
   drizzle schema is a red test rather than a green suite and a broken deploy.
5. **`packages/server/src/Notifications/NotificationsRepo.ts`** — Drizzle in, domain types out,
   `null` for absent, `stage*` methods for anything that must be atomic with another write. This is
   the only file in the context allowed to import `@gc/db`.
6. **`packages/server/src/Notifications/Policy.ts`** — pure predicates, branded results.
7. **`packages/server/src/Notifications/NotificationsService.ts`** —
   `makeNotificationsService(deps)`. No `hono`, no `@gc/db`, every dep `readonly`.
8. **`packages/server/src/Notifications/Http.ts`** — one expression per route, exported as
   `notificationsRouter`.
9. **Register in `container.ts`** — construct the repo, wrap both in `traced()`, add the service
   under a key (`notifications`), and mount the router in `apps/api/src/app.ts`.
10. **`Notifications.test.ts`** — against the service, over `makeTestD1()` with the real repository,
    a `fixedClock` and the fake email port. Plus `Notifications.http.test.ts` if step 2 produced
    routes.

Steps 1–7 never mention Hono. That is the point: the framework is reachable from ten lines of
`Http.ts` and one middleware, so replacing it is a day's work rather than a rewrite.

### The part that is actually interesting: the port

Sending email means an outbound call to something that can fail, retry and duplicate — exactly the
shape bKash already has. So it gets the same treatment, and copying `Integrations/Bkash/` is the
fastest way to get it right:

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

Four properties to carry across, each of which the bKash port already demonstrates:

- **The port is a type in the consuming context's folder**, not in the provider's. Notifications
  declares what it needs; `Integrations/Email/` implements it.
- **There is a deterministic fake** (`makeEmailFake`) that records its calls, and the container
  picks it from config — not from `NODE_ENV`, and not through a test-only seam. The fake is the
  implementation E2E uses.
- **The idempotency key is computed by the caller**, from data that is already stable (a ticket id,
  a payment event id), so a retried send is a no-op at the provider rather than a second email.
- **A transport failure is a typed error** (`ChannelUnavailable`, 502) and leaves a row the sweeper
  can find. Nothing is fire-and-forget.

And then wire it into the cron, not into the request path: `svc.notifications.sweepPending(200)`
alongside the existing three sweeps. A registration confirms whether or not the email provider is
up, because confirming is a database transition and sending is a separate, retryable fact.

### Why this one is not in the template

A `NotificationPort` would teach "declare the port, inject it, fake it in tests" — which the bKash
port already teaches, against a harder problem (a non-idempotent call, a signed webhook, and money
on the line). Two ports teaching the same lesson would be padding. It is documented here instead,
as the first extension, precisely because the recipe is the deliverable and the code would not add
one.

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
- §7's two greps keep the import table mechanical rather than aspirational.

What is *not* recovered: nothing tells you that `TicketsService.register` can throw `SoldOut`
except `Ticket/Errors.ts` and the test that provokes it. Write that test.

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
      "@gc/db": "Services never touch the database. Put the query in <Plural>Repo.ts.",
      "drizzle-orm": "Services never touch the database. Put the query in <Plural>Repo.ts.",
      "hono": "Services are framework-free. Take the value as a parameter."
    } } } } } }
  },
  {
    "includes": ["packages/server/src/**/Http.ts"],
    "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error", "options": { "paths": {
      "@gc/db": "Handlers read c.var.svc, never the database."
    } } } } } }
  }
]
```

The other half is three greps the linter cannot express, in `scripts/check-architecture.mjs`:

1. **`c.env` / `process.env` outside `container.ts` and `Runtime/*`** — *"Env is read in
   container.ts and Runtime/\* only (R5)."*
2. **A `*Repo` imported as a value by anything other than `container.ts` and a `*.test.ts`** —
   *"Repositories are constructed in container.ts. Take the repo as a dep (R3)."* A type-only
   import (`import type { EventsRepo }`) is allowed everywhere, which is exactly how
   `TicketsService` names its cross-context dependency without being able to construct one.
3. **`readonly` on every field of every `*Deps` type** — *"Deps are readonly (R3)."*

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
its D1 and KV calls. No SDK produces it, and no framework choice changes it. gcnotes ships no OTLP
exporter and no `@opentelemetry/*` dependency; if you want one, §8.7.

> The outer `"enabled": false` with nested blocks true is copied deliberately and is one of the
> four things `docs/DECISIONS.md` says to verify (D012). Do not "fix" the outer flag.

### 8.2 The part you have to build, and what it usually costs

The runtime gives you invocation and subrequest spans. What it cannot give you is *application*
spans — the `Tickets.register` and `Payments.handleCallback` names that make a trace readable.

The usual way to get those is to annotate each method by hand. That approach is not wrong, it is
just expensive in a way that only shows up later: the codebase this architecture was extracted from
had 632 hand-written span annotations, five competing naming conventions among them, and a
decision log entry about the cost of unifying them after the fact. Every one of those was typed by
a person, and every one could be mistyped, forgotten or renamed out of step.

| | Hand-written spans | This shape |
| --- | --- | --- |
| Invocation, subrequest, D1, KV spans | from workerd | from workerd — identical |
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
const eventsRepo = traced("EventsRepo", makeEventsRepo(db));
const events = traced("Events", makeEventsService({ clock, ids, repo: eventsRepo }));
```

Four things follow, and the last is the reason this section is not a downgrade:

1. **Every public method of every service and repository is spanned**, including the ones nobody
   would have remembered to annotate.
2. **`<Module>.<method>` in the casing of the exported identifier** is produced mechanically. It
   cannot drift, because there is no string to mistype. Module names in gcnotes are exactly
   `Events`, `EventsRepo`, `Tickets`, `TicketsRepo`, `Payments`, `PaymentsRepo`, and the wrapper is
   applied to those six objects and nothing else.
3. **Repository spans come free**, so a slow endpoint decomposes into its queries without a second
   instrumentation pass — which is how you find out that `register` spends its time in
   `EventsRepo.ticketTypesByIds` and not where you assumed.
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
slugs (`bkash.unreachable`, `hold.swept`), span names are `<Module>.<method>`, and the two are
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

`@microlabs/otel-cf-workers` is the Workers-targeted SDK and auto-instruments fetch, KV and D1
calls. The `traced` wrapper becomes a thin call into `@opentelemetry/api` instead of
`cloudflare:workers`, and the `<Module>.<method>` naming is unchanged. Nothing in §1–§7 moves. It
is not a dependency here because an unexported span is worth less than no span, and gcnotes has
nowhere to export to.

---

## 9. Where the hard parts are

This document describes the shape. The companion files describe the problems the shape is
arranged around, and they are not optional reading before changing anything in `packages/server`:

| File | What it settles |
| --- | --- |
| `CONCURRENCY.md` | Every race in gcnotes, the exact SQL that resolves it, and what breaks if the guard is "simplified" away. Read it before touching a `WHERE` clause. |
| `BKASH.md` | The payment state machine, the idempotency chokepoint, the fake's script vocabulary, and the sandbox recipe. |
| `D1-NOTES.md` | Batch semantics, the bound-parameter arithmetic behind the chunk sizes, and what D1 will not do for you. |
| `DEPLOYMENT.md` | One branch and why flags replace the others, the pipeline and its promotion gate, the three rollback tiers with their commands, and the expand/contract rules D1's missing rollback forces. Read it before writing a migration. |
| `../DECISIONS.md` | Why the schema has one seat counter and not two, why the test doubles were deleted (D016), and the three open items that need verifying against real infrastructure. |
| `../TESTING.md` | The real-SQLite harness and what it does and does not model, the wire-shape test pattern, and the minimum scenarios by name. |

The standing design rule, which resolves ambiguities none of those cover: **every failure mode is
arranged to under-sell or under-issue, never to over-sell or double-charge.** If the choice is
between an attendee briefly told a seat is unavailable when it is, and two attendees holding the
same seat, choose the first, every time.
