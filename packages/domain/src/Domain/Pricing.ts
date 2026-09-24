import { ValidationFailed } from "../Errors";
import {
  ExceedsPerRegistrationLimit,
  TicketTypeNotFound,
} from "../Ticket/Errors";
import {
  type EventId,
  ID_PREFIX,
  type RegistrationId,
  type TicketCode,
  TicketId,
  type TicketTypeId,
} from "./Ids";
import { MAX_POISHA, type Poisha, poisha } from "./Money";
import type { PricedLine, Registration, RequestedLine } from "./Registration";
import type { TicketType } from "./TicketType";
import type { Timestamp } from "./Time";

/** The insert shape for `tickets`. `status` is the column's default and is not set here. */
export type NewTicketRow = {
  readonly code: TicketCode;
  readonly eventId: EventId;
  readonly id: TicketId;
  readonly issuedAt: Timestamp;
  readonly registrationId: RegistrationId;
  readonly seq: number;
  readonly ticketTypeId: TicketTypeId;
};

const byTicketTypeId = (
  a: { readonly ticketTypeId: TicketTypeId },
  b: { readonly ticketTypeId: TicketTypeId }
) => {
  if (a.ticketTypeId < b.ticketTypeId) {
    return -1;
  }
  return a.ticketTypeId > b.ticketTypeId ? 1 : 0;
};

// The sort by `ticketTypeId` is not cosmetic: `register` stages one guarded UPDATE per line into a
// D1 batch, and a stable order keeps that batch and its compensating batch reproducible.
// A repeated ticket type is rejected because `registration_items` is keyed on
// `(registration_id, ticket_type_id)` — a repeat is a primary-key violation, not a bigger order.
export const priceLines = (
  types: readonly TicketType[],
  requested: readonly RequestedLine[]
): PricedLine[] => {
  const byId = new Map(types.map((type) => [type.id, type]));
  const seen = new Set<TicketTypeId>();

  const priced = requested.map((line) => {
    const type = byId.get(line.ticketTypeId);
    if (!type) {
      throw new TicketTypeNotFound({ ticketTypeId: line.ticketTypeId });
    }
    if (seen.has(line.ticketTypeId)) {
      throw new ValidationFailed(
        { ticketTypeId: line.ticketTypeId },
        "A ticket type may appear at most once per registration"
      );
    }
    seen.add(line.ticketTypeId);
    if (line.quantity > type.maxPerRegistration) {
      throw new ExceedsPerRegistrationLimit({
        maxPerRegistration: type.maxPerRegistration,
        quantity: line.quantity,
        ticketTypeId: line.ticketTypeId,
      });
    }
    return {
      quantity: line.quantity,
      ticketTypeId: line.ticketTypeId,
      unitPricePoisha: type.pricePoisha,
    };
  });

  return priced.sort(byTicketTypeId);
};

// Throws `ValidationFailed` rather than letting `poisha()` raise a ZodError, which `on-error.ts`
// could only answer as a 500.
export const totalPoisha = (lines: readonly PricedLine[]): Poisha => {
  const sum = lines.reduce(
    (running, line) => running + line.unitPricePoisha * line.quantity,
    0
  );
  if (sum > MAX_POISHA) {
    throw new ValidationFailed(
      { maxPoisha: MAX_POISHA, totalPoisha: sum },
      "Registration total exceeds the per-registration ceiling"
    );
  }
  return poisha(sum);
};

// Ids are deterministic (`tkt_<registration suffix>_<seq>`, seq 1..n in `ticketTypeId` order) and
// that is the whole idempotency story: a replayed callback re-inserts under
// `ON CONFLICT (id) DO NOTHING` and writes zero rows. `code` may differ on a replay, harmlessly.
export const ticketRowsFor = (
  registration: Pick<Registration, "eventId" | "id">,
  lines: readonly PricedLine[],
  issuedAt: Timestamp,
  makeCode: () => TicketCode
): NewTicketRow[] => {
  const suffix = registration.id.slice(ID_PREFIX.registration.length);
  const rows: NewTicketRow[] = [];
  let seq = 0;

  for (const line of [...lines].sort(byTicketTypeId)) {
    for (let n = 0; n < line.quantity; n += 1) {
      seq += 1;
      rows.push({
        code: makeCode(),
        eventId: registration.eventId,
        id: TicketId.parse(`${ID_PREFIX.ticket}${suffix}_${seq}`),
        issuedAt,
        registrationId: registration.id,
        seq,
        ticketTypeId: line.ticketTypeId,
      });
    }
  }

  return rows;
};
