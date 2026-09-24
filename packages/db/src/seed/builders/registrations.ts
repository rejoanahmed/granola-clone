import { and, eq, sql } from "drizzle-orm";
import {
  paymentEvents,
  payments,
  registrationItems,
  registrations,
  tickets,
  ticketTypes,
} from "../../schema";
import type { SeedDb } from "../core/client";
import type { Rng } from "../core/rng";
import type { SeededEvent } from "./events";
import type { SeededUser } from "./identity";

const MINUTE_MS = 60 * 1000;
const HOLD_MINUTES = 30;
/** `reg_` — stripped to build the deterministic ticket id. */
const ID_PREFIX_LENGTH = 4;

type Line = {
  readonly quantity: number;
  readonly ticketTypeId: string;
  readonly unitPricePoisha: number;
};

export type SeededRegistrations = {
  readonly confirmed: {
    readonly id: string;
    readonly ticketCodes: readonly string[];
  };
  readonly pending: { readonly holdExpiresAt: number; readonly id: string };
};

export type RegistrationsDeps = {
  readonly attendees: readonly [SeededUser, SeededUser];
  readonly db: SeedDb;
  readonly event: SeededEvent;
  readonly now: number;
  readonly rng: Rng;
};

function lineFor(event: SeededEvent, name: string, quantity: number): Line {
  const type = event.ticketTypes.find((t) => t.name === name);
  if (!type) {
    throw new Error(
      `registrations: "${event.title}" has no ticket type "${name}"`
    );
  }
  return { quantity, ticketTypeId: type.id, unitPricePoisha: type.pricePoisha };
}

// The same compare-and-increment the API runs (`EventsRepo.stageClaim`), not a bare SET: an
// over-subscribed seed fails here instead of tripping the CHECK mid-run.
function claim(deps: RegistrationsDeps, line: Line, at: number): void {
  const result = deps.db
    .update(ticketTypes)
    .set({
      quantityClaimed: sql`quantity_claimed + ${line.quantity}`,
      updatedAt: at,
    })
    .where(
      and(
        eq(ticketTypes.id, line.ticketTypeId),
        sql`quantity_claimed + ${line.quantity} <= quantity_total`
      )
    )
    .run();
  if (result.changes !== 1) {
    throw new Error(
      `registrations: ticket type ${line.ticketTypeId} could not claim ${line.quantity} seats`
    );
  }
}

function insertRegistration(
  deps: RegistrationsDeps,
  input: {
    readonly attendee: SeededUser;
    readonly attendeePhone: string;
    readonly confirmedAt: number | null;
    readonly createdAt: number;
    readonly lines: readonly Line[];
    readonly status: "confirmed" | "pending";
  }
): {
  readonly holdExpiresAt: number;
  readonly id: string;
  readonly totalPoisha: number;
} {
  const { db, rng } = deps;
  const id = rng.id("reg_");
  const holdExpiresAt = input.createdAt + HOLD_MINUTES * MINUTE_MS;
  const totalPoisha = input.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPricePoisha,
    0
  );

  db.insert(registrations)
    .values({
      attendeeId: input.attendee.id,
      attendeeName: input.attendee.name,
      attendeePhone: input.attendeePhone,
      confirmedAt: input.confirmedAt,
      createdAt: input.createdAt,
      eventId: deps.event.id,
      holdExpiresAt,
      id,
      status: input.status,
      totalPoisha,
      updatedAt: input.confirmedAt ?? input.createdAt,
    })
    .run();

  for (const line of input.lines) {
    db.insert(registrationItems)
      .values({
        quantity: line.quantity,
        registrationId: id,
        ticketTypeId: line.ticketTypeId,
        unitPricePoisha: line.unitPricePoisha,
      })
      .run();
    claim(deps, line, input.createdAt);
  }

  return { holdExpiresAt, id, totalPoisha };
}

// Ids and seq ordering must stay byte-identical to `ticketRowsFor` in the domain: seq 1..n
// ordered by ticketTypeId then n.
function issueTickets(
  deps: RegistrationsDeps,
  registrationId: string,
  lines: readonly Line[],
  issuedAt: number
): string[] {
  const ordered = [...lines].sort((a, b) =>
    a.ticketTypeId < b.ticketTypeId ? -1 : 1
  );
  const codes: string[] = [];
  let seq = 0;

  for (const line of ordered) {
    for (let n = 0; n < line.quantity; n++) {
      seq += 1;
      const code = deps.rng.code();
      deps.db
        .insert(tickets)
        .values({
          code,
          eventId: deps.event.id,
          id: `tkt_${registrationId.slice(ID_PREFIX_LENGTH)}_${seq}`,
          issuedAt,
          registrationId,
          seq,
          status: "issued",
          ticketTypeId: line.ticketTypeId,
        })
        .run();
      codes.push(code);
    }
  }
  return codes;
}

function recordSucceededPayment(
  deps: RegistrationsDeps,
  registrationId: string,
  amountPoisha: number,
  settledAt: number
): void {
  const { db, rng } = deps;
  const id = rng.id("pay_");
  const bkashPaymentId = `TR0011${rng.id().slice(0, 14)}`;
  const bkashTrxId = rng.id().slice(0, 10).toUpperCase();

  db.insert(payments)
    .values({
      amountPoisha,
      bkashPaymentId,
      bkashTrxId,
      bkashUrl: `https://sandbox.payment.bkash.com/redirect/tokenized/?paymentID=${bkashPaymentId}`,
      createdAt: settledAt - 4 * MINUTE_MS,
      id,
      merchantInvoiceNumber: id,
      registrationId,
      settledAt,
      status: "succeeded",
      updatedAt: settledAt,
    })
    .run();

  db.insert(paymentEvents)
    .values({
      // The dedupe key: a replayed callback carrying this same trxID writes nothing.
      externalRef: bkashTrxId,
      id: rng.id("pev_"),
      outcome: "succeeded",
      payload: {
        amount: (amountPoisha / 100).toFixed(2),
        currency: "BDT",
        paymentID: bkashPaymentId,
        transactionStatus: "Completed",
        trxID: bkashTrxId,
      },
      paymentId: id,
      receivedAt: settledAt,
      signatureVerified: null,
      source: "callback",
    })
    .run();
}

export function buildRegistrations(
  deps: RegistrationsDeps
): SeededRegistrations {
  const { attendees, event, now } = deps;
  const [first, second] = attendees;

  // 25 minutes left at the anchor instant, so the hold sweep has a live row to ignore.
  const pendingLines = [lineFor(event, "General Admission", 2)];
  const pending = insertRegistration(deps, {
    attendee: first,
    attendeePhone: "8801712345678",
    confirmedAt: null,
    createdAt: now - 5 * MINUTE_MS,
    lines: pendingLines,
    status: "pending",
  });

  // Two ticket types: the multi-line case the reservation batch and issuance ordering exist for.
  const confirmedAt = now - 2 * 24 * 60 * MINUTE_MS;
  const confirmedLines = [
    lineFor(event, "General Admission", 1),
    lineFor(event, "VIP", 1),
  ];
  const confirmed = insertRegistration(deps, {
    attendee: second,
    attendeePhone: "8801812345679",
    confirmedAt,
    createdAt: confirmedAt - 6 * MINUTE_MS,
    lines: confirmedLines,
    status: "confirmed",
  });
  const ticketCodes = issueTickets(
    deps,
    confirmed.id,
    confirmedLines,
    confirmedAt
  );
  recordSucceededPayment(
    deps,
    confirmed.id,
    confirmed.totalPoisha,
    confirmedAt
  );

  return {
    confirmed: { id: confirmed.id, ticketCodes },
    pending: { holdExpiresAt: pending.holdExpiresAt, id: pending.id },
  };
}
