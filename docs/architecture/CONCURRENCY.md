# Concurrency — the guarantees, and the SQL that produces them

This is the file that stops someone simplifying a guard away.

Every statement below looks like it has a redundant clause. None of them do. Each `WHERE` fragment
that reads as a re-check of something the code already knows is in fact the *only* place that
knowledge is enforced, because **D1 has no interactive transactions**: you cannot read a row,
decide, and then write based on that decision inside one atomic unit. `d1.batch()` is atomic, but
its statements are compiled before any of them runs. So every branch that would have been an `if`
is pushed into a `WHERE` clause, and the branch is taken by inspecting `meta.changes` afterwards.

Read `D1-NOTES.md` for the mechanics of the batch. This file is the catalogue of what the mechanics
are used for.

**The standing rule for every entry:** *every failure mode is arranged to under-sell or
under-issue, never to over-sell or double-charge.* Where the two are in tension, the losing
attendee sees a 409 and retries. That is the design, not a bug being tolerated.

---

## Summary

| # | Risk | Mechanism | Where | Provoked by |
| --- | --- | --- | --- | --- |
| 1 | Oversell | Compare-and-increment in one statement | `EventsRepo.stageClaim` | `Events.test.ts` "lets exactly one of two claims take the only seat" |
| 2 | Partially satisfiable multi-line reservation | Compensating batch, not rollback | `TicketsService.register` | `Tickets.test.ts` "compensates the winning line when another line loses, then throws SoldOut" |
| 3 | Replayed callback / webhook | `ON CONFLICT (payment_id, external_ref) DO NOTHING` | `PaymentsService.applyResult` | `Payments.test.ts` "is a duplicate when the callback already applied the same trxId" |
| 4 | Double ticket issuance | Deterministic ids + `ON CONFLICT (id) DO NOTHING` | `TicketsRepo.stageTickets` | `Tickets.test.ts` "issues each ticket once and moves no counter" |
| 5 | Double execute at bKash | `initiated → executing` lease | `PaymentsRepo.claimExecute` | `Payments.test.ts` "lets exactly one of two simultaneous callbacks execute" |
| 6 | Two payments for one registration | Partial unique index | `PaymentsRepo.insert` | `Payments.test.ts` "lets a retry through once the first payment failed — the predicate, not the column" |
| 7 | Hold expiry racing payment success | Guarded transition + automatic refund | `TicketsService.confirm` | `Tickets.test.ts` "issues nothing when the hold was swept before the money landed"; `Payments.test.ts` "refunds automatically when the hold was swept before the money landed" |
| 8 | Seat-counter drift on release | Two units of work, in this order | `TicketsService.release` | `Tickets.test.ts` "returns the seats once, even when two callers release the same hold" |
| 9 | Stale result read | `StatementRef.changes` throws before flush | `Runtime/UnitOfWork` | `Events.test.ts` "refuses to report a claim's result before the batch has flushed" |
| 10 | D1 bound-param ceiling | `chunkForBoundParams` / `chunkIds` | `Runtime/UnitOfWork` | `UnitOfWork.test.ts` "never exceeds the bound-parameter ceiling" |
| 11 | Double check-in | Guarded row UPDATE + one follow-up read | `TicketsRepo.checkIn` | `Tickets.test.ts` "admits once and answers the second scan with the FIRST scan's time" |
| 12 | Publish/cancel racing a registration | Guarded transitions, sweeper cleanup | `EventsRepo.transition` | `Events.test.ts` "lets exactly one of two simultaneous publishes through the transition guard" |

Every test in the last column runs the **shipped** statement against a migrated in-memory SQLite
(`Testing/Database.ts`, D016), so a row here is a claim about the SQL that deploys rather than about
a TypeScript restatement of it. Row 10 is the exception and is honest about it: D1's bound-parameter
ceiling is not SQLite's, so the chunker is proved by arithmetic in its own unit test.

---

## 1 · Oversell

**The race.** Two attendees hold the last seat at the same millisecond. Both read
`quantity_claimed = 9, quantity_total = 10`. Both write `10`. Ten seats sold, eleven attendees at
the gate.

**The mechanism.** There is no read. The comparison and the increment are the same statement, and
SQLite serialises writers, so the comparison is evaluated against the state the increment will
apply to.

```sql
UPDATE ticket_types
   SET quantity_claimed = quantity_claimed + :q,
       updated_at       = :at
 WHERE id = :id
   AND quantity_claimed + :q <= quantity_total;
```

`changes === 1` won the seats. `changes === 0` lost them — the row exists, but taking `:q` more
would have exceeded the total. The caller cannot tell "lost the race" from "no such ticket type"
from this statement alone, and does not need to: `register` has already loaded the ticket types by
id, so a zero here means contention.

**The backstop.** `ticket_types` carries

```sql
CHECK (quantity_claimed >= 0 AND quantity_claimed <= quantity_total)
```

which turns a guard someone forgets to write into a hard D1 error at write time, instead of a
silent oversell discovered at the venue gate. The `CHECK` is not the mechanism — it is the alarm
that fires when the mechanism is missing.

**If you simplify it away.** The tempting version is `SELECT` the row, check availability in
TypeScript, then `UPDATE … SET quantity_claimed = :computed`. It reads better and it oversells
under any real concurrency. It also destroys the `CHECK`'s usefulness, because a computed absolute
value passes the constraint while still being wrong.

**Why one counter and not two.** There is no `quantity_sold`. A hold and a sale both consume a
seat, so confirmation moves no counter at all — which deletes the entire
double-increment-on-replay class of bug, because there is nothing to increment when a payment
lands. `quantity_claimed` goes up exactly once (reservation) and down exactly once (expiry, cancel
or refund), each behind a guard. "Sold out" is derived (`quantity_claimed >= quantity_total`),
never stored: a stored flag would be a second source of truth D1 cannot keep in step with the
first.

---

## 2 · Partially satisfiable multi-line reservation

**The race.** A registration asks for 2 × General and 1 × VIP. The General claim wins; the VIP
claim loses to a concurrent attendee. The batch is atomic — and commits anyway, because **a
guarded `UPDATE` that matches zero rows is not an error.** D1 has nothing to roll back: every
statement succeeded, one of them just did nothing.

This is the single most important D1 fact in the template.

**The mechanism.** Compensation, not rollback. `register` opens one unit of work and stages, in
this exact order:

```
stageRegistration            -- INSERT INTO registrations (status='pending', hold_expires_at=…)
stageItems                   -- INSERT INTO registration_items … (the priced snapshot)
events.stageClaim × N        -- the UPDATE from §1, once per line
```

**The registration and its items are written before any counter moves.** If the isolate dies
mid-flush, the pending row plus its items say exactly which seats to give back, and
`sweepExpiredHolds` gives them back. The reverse order would leave decremented counters with no
record of who holds them — seats lost permanently, correctable only by hand.

After the flush, each claim's `.changes` is inspected. If every one is `1`, return the detail. If
any is `0`, issue **one** compensating unit of work:

```sql
-- for each line that WON:
UPDATE ticket_types
   SET quantity_claimed = quantity_claimed - :q,
       updated_at       = :at
 WHERE id = :id
   AND quantity_claimed >= :q;

-- then, in the same batch:
UPDATE registrations
   SET status          = 'expired',
       release_reason  = 'expired',
       released_at     = :at,
       updated_at      = :at
 WHERE id = :registration_id
   AND status = 'pending';
```

and then `throw new SoldOut({ ticketTypeIds: [<the losers>] })`.

The `quantity_claimed >= :q` guard on the release makes the counter incapable of going negative
even if a caller is wrong about what it holds.

**Why `registration_items` exists at all.** One ticket type per registration would make this a
single statement and delete the lesson. The multi-line compensating batch is the hardest D1
problem in gcnotes and the table is kept for exactly that reason (`DECISIONS.md` D005).

---

## 3 · Replayed callback / webhook

**The race.** bKash redirects the attendee's browser back to us *and* posts a webhook carrying the
same `trxID`. Both arrive. Without a guard, the payment settles twice and — worse — fulfilment runs
twice.

**The mechanism.** One insert, and everything else lives behind it.

```sql
INSERT INTO payment_events (id, payment_id, external_ref, source, outcome, payload, received_at, signature_verified)
VALUES (:id, :payment_id, :external_ref, :source, :outcome, :payload, :received_at, :signature_verified)
ON CONFLICT (payment_id, external_ref) DO NOTHING;
```

`changes === 0` means this exact fact has already been applied: reload the payment, return
`{ outcome: "noop" }`, and **perform no side effect.** This is the single idempotency chokepoint in
gcnotes — `handleCallback`, `handleWebhook`, `reconcile` and `sweepStale` all funnel through
`applyResult`, and `applyResult` starts here.

**`external_ref`** is `trxId` when bKash supplies one, else `${bkashPaymentId}:${transactionStatus}`.
The fallback is what makes a `Cancelled` notification dedupable even though no transaction exists.

**Dedupe is on `(payment_id, external_ref)` and deliberately not on `source`.** A webhook carrying
a trxID the redirect callback already applied must be a true no-op — first writer wins across all
six sources. Adding `source` to the unique index is the most plausible "obvious improvement" in
this file and it reintroduces exactly the bug the index exists to prevent.

---

## 4 · Double ticket issuance

**The race.** `confirm` runs twice for the same registration — a retried callback that got past
§3 because it carried a different `external_ref`, or an operator running `reconcile` by hand.

**The mechanism.** Ticket ids are **deterministic**: `tkt_<registration id without its prefix>_<seq>`,
where `seq` is 1-based and ordered by `ticket_type_id` then `n`. So the second run computes the
identical primary keys:

```sql
INSERT INTO tickets (id, code, event_id, registration_id, ticket_type_id, seq, status, issued_at)
VALUES (:id, :code, :event_id, :registration_id, :ticket_type_id, :seq, 'issued', :issued_at)
ON CONFLICT (id) DO NOTHING;
```

and writes zero rows.

**Codes are random** — 10 Crockford base32 characters from `crypto.getRandomValues` — because a QR
payload that is a pure function of a public id is guessable. Randomness does not break idempotency:
the conflict clause means the second write never lands, so the first code survives.
`tickets_code_unq` is a collision guard, not an identity mechanism.

**The transition is staged first, and its `changes` is the return signal:**

```sql
UPDATE registrations
   SET status       = 'confirmed',
       confirmed_at = :at,
       updated_at   = :at
 WHERE id = :id
   AND status = 'pending';
```

- `changes === 1` → `"confirmed"`.
- `changes === 0` and the row is already `confirmed` → `"already"`, zero tickets issued.
- `changes === 0` otherwise → `"not-holdable"` (see §7).

**No counter is touched by confirmation.** The seat was consumed at hold time (§1). This is what
makes the whole replay story a one-liner rather than a discipline.

---

## 5 · Double execute at bKash

**The race.** `executePayment` is the one bKash call that is **not** idempotent. Every other call
is. If the redirect callback and the webhook both decide to execute, the provider may charge twice.

**The mechanism.** A lease, taken by a guarded transition before any network call:

```sql
UPDATE payments
   SET status     = 'executing',
       updated_at = :at
 WHERE id = :id
   AND status = 'initiated';
```

`true` (changes === 1) — you own the execute; call `bkash.executePayment`.
`false` — someone else owns it; call `bkash.queryPayment` instead, which is idempotent and
authoritative. Any disagreement between our state and bKash's resolves to `queryPayment`'s answer.

**bKash `2062` ("already executed") is not a failure.** The client maps it to
`{ kind: "already_executed" }`, and the service routes that straight to `queryPayment`. Treating it
as an error would strand payments that in fact succeeded.

**If you simplify it away.** A boolean flag on the payment row read before the call has a window
between the read and the write. The transition has none: the status column *is* the lease.

---

## 6 · Two payments for one registration

**The race.** The attendee has the registration open in two tabs and clicks Pay in both.

**The mechanism.** A partial unique index does the concurrency control, and the violation is the
signal:

```sql
CREATE UNIQUE INDEX payments_live_per_reg_unq
    ON payments (registration_id)
 WHERE status IN ('initiated', 'executing', 'succeeded');
```

`PaymentsRepo.insert` catches the constraint violation and returns
`{ ok: false, existing }` instead of throwing. `createCheckout` then returns the existing
checkout — the user sees one bKash URL, not a 500 and not a second charge.

The predicate is the interesting part: a `failed`, `cancelled` or `expired` payment does not
occupy the slot, so a genuine retry after a failure is allowed. The index encodes "at most one
*live* payment per registration" directly, which no amount of application code can do race-free.

`createCheckout` also short-circuits before the insert: if `liveForRegistration` already returns a
row with a `bkash_url`, that URL is returned immediately. The index is the backstop for the case
where both tabs get past that check at the same instant.

**Two companion indexes, doing different jobs:**

```sql
CREATE UNIQUE INDEX payments_invoice_unq  ON payments (merchant_invoice_number);
CREATE UNIQUE INDEX payments_bkash_id_unq ON payments (bkash_payment_id);
```

`merchant_invoice_number` is **our** key at bKash (it is the payment id), so a retried create
cannot produce two charges on their side. `bkash_payment_id` is nullable and SQLite treats NULLs as
distinct, so that index is effectively partial for free: it constrains only payments that actually
reached bKash.

---

## 7 · Hold expiry racing payment success

**The race.** The 30-minute hold expires while the attendee is on the bKash checkout page. The
sweeper releases the seats. Then the money lands.

**The mechanism.** Both sides issue the same guarded single-row UPDATE on `status = 'pending'`, so
exactly one wins:

```sql
-- the sweeper
UPDATE registrations
   SET status = 'expired', release_reason = 'expired', released_at = :now, updated_at = :now
 WHERE id = :id AND status = 'pending';

-- confirm, from applyResult
UPDATE registrations
   SET status = 'confirmed', confirmed_at = :now, updated_at = :now
 WHERE id = :id AND status = 'pending';
```

If expiry won, `confirm` returns `"not-holdable"`. The payment **still settles to `succeeded`** —
the money genuinely moved, and pretending otherwise would lose it — and `applyResult` immediately
calls `refundForRegistration(registrationId, "hold_lost")`.

**This is the one case in gcnotes that costs money, and it is modelled rather than wished away.**
It is the honest consequence of holding seats for thirty minutes against a third-party checkout
window we do not control. No tickets are issued, the seats stay released, and the attendee is
refunded automatically.

**Do not "fix" it by extending the transition's allowed set to include `expired`.** That reissues
seats that have already been given to somebody else — trading a refund for an oversell, which is
the wrong direction under the standing rule.

---

## 8 · Seat-counter drift on release

**The race.** Two callers release the same registration — the cancelled-event sweep and the
attendee's own cancel, or a retried cron.

**The mechanism.** `release` is deliberately **two** units of work, in this order, never one:

```sql
-- (a) the claim on the release, alone in its own batch
UPDATE registrations
   SET status         = :terminal,      -- 'expired' | 'cancelled' | 'refunded'
       release_reason = :reason,
       released_at    = :at,
       updated_at     = :at
 WHERE id = :id
   AND status IN (:releasable_from);    -- e.g. ('pending') for expiry, ('confirmed') for refund
```

If `changes === 0`, **stop**: someone else already released it. Only past that point:

```sql
-- (b) the decrements, one per line, plus the void when the reason warrants it
UPDATE ticket_types
   SET quantity_claimed = quantity_claimed - :q, updated_at = :at
 WHERE id = :ticket_type_id
   AND quantity_claimed >= :q;

UPDATE tickets
   SET status = 'void', voided_at = :at
 WHERE registration_id = :id
   AND status <> 'void';                -- only for 'refunded' and 'event_cancelled'
```

**The trade, stated plainly.** A crash between (a) and (b) leaves seats claimed that nobody holds:
the event under-sells by a few seats and an operator can correct it. The reverse ordering — release
the seats first, then mark the registration — lets a double release decrement twice and **oversell**.
Under-selling is recoverable at a desk; overselling is recoverable at a venue gate, in front of
people who paid.

---

## 9 · Stale result read

**The race.** This one is not between two requests. It is between the author and themselves.

```ts
const claims = lines.map((l) => events.stageClaim(stage, l, now));
if (claims.every((c) => c.changes === 1)) { /* … */ }   // inside the unit of work — WRONG
```

Nothing has run yet. The statements are staged; `d1.batch()` has not been called.

**The mechanism.** `StatementRef.changes` is a getter that throws until the batch has flushed:

```
UnitOfWork result read before commit; move the read after the unit of work
```

**Why this earns a line in a concurrency document.** Without it, the read yields `undefined`,
`undefined === 1` is `false`… or, written the other way round, the code believes every claim
succeeded and oversells. It is a bug that typechecks, passes review, and only appears under load.
One throwing getter removes the entire class.

---

## 10 · D1 bound-parameter ceiling

Not a race, but a correctness limit with the same "works in dev, fails at the venue" signature: D1
rejects a statement with more than **100 bound parameters**, and an `IN` list is bound parameters.

```
chunkForBoundParams(rows, columnsPerRow, 100)
  registration_items   4 columns  -> 25 rows per statement
  tickets              8 columns  -> 12 rows per statement
chunkIds(ids, 90)                 -> every inArray(...) in every repo
```

`maxPerRegistration ≤ 10` and `lines ≤ 10` mean the happy path is always one chunk. **So chunking
is proved by unit tests, not by production** — `UnitOfWork.test.ts` exercises the arithmetic
directly, because no realistic registration will ever reach a second chunk and a bug there would
otherwise be discovered by an organiser bulk-importing something.

See `D1-NOTES.md` for where 100 comes from and what else it constrains.

---

## 11 · Double check-in

**The race.** Two gate staff scan the same ticket, or one scans twice because the first response
was slow.

**The mechanism.** The §1 technique at row scale — deliberately shown twice in the template, so the
pattern reads as a pattern rather than a one-off:

```sql
UPDATE tickets
   SET status        = 'checked_in',
       checked_in_at = :at,
       checked_in_by = :actor_id
 WHERE code = :code
   AND status = 'issued';
```

`changes === 1` → admitted. `changes === 0` → **one follow-up read** distinguishes the three cases,
and that read is safe precisely because the write already failed:

| Follow-up read | Error |
| --- | --- |
| no row | `TicketNotFound` (404) |
| `status = 'checked_in'` | `TicketAlreadyCheckedIn` (409), with `details.checkedInAt` and `details.checkedInBy` — the **first** scan's values |
| `status = 'void'` | `TicketVoid` (410) |

Returning the original scan time is what makes the 409 useful at a gate: the second scanner learns
*when* the ticket was used, not merely that it was.

---

## 12 · Publish/cancel racing a registration

**The race.** An organiser cancels an event while an attendee is mid-registration.

**The mechanism, and its honest limit.** The status transitions themselves cannot double-fire:

```sql
UPDATE events
   SET status = :to, updated_at = :at, published_at = :published_at
 WHERE id = :id
   AND status IN (:from);
```

`register` re-reads the event and refuses anything that is not `published` — but **that read is not
a lock and is not claimed to be one.** A registration can slip through between the read and the
cancel.

That is accepted, not prevented, and the recovery is explicit:
`sweepCancelledEvents` finds registrations against cancelled events, releases the `pending` ones,
and collects the `confirmed` ones as `refundable` for `Payments.refundForRegistration`. The refund
is what flips a registration to `refunded`, so the next sweep does not return it.

Locking the event for the duration of a registration would mean a second table, a lease, and an
expiry for the lease — three new races to prevent one rare one whose consequence is an automatic
refund. The sweeper is the cheaper correct answer.

---

## What to check when you change any of this

1. **Does the branch live in the `WHERE` clause?** If the code reads a row, decides, and then
   writes, it is wrong on D1 no matter how it is tested.
2. **Is `changes` inspected after the flush, never before?** (§9.)
3. **Does a test provoke the real statement?** Not a restatement of it — the compiled `WHERE`
   clause, run against a migrated SQLite, asserted through `meta.changes` or through the row it
   left behind. The summary table's last column is that list; a new guard adds a row to it in the
   same commit. (`docs/TESTING.md` §2.)
4. **Under a crash at every statement boundary, does the system under-sell or over-sell?**
   Under-sell is the only acceptable answer.
