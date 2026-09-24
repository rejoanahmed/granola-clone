import { events, ticketTypes } from "../../schema";
import type { SeedDb } from "../core/client";
import type { Rng } from "../core/rng";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type SeededTicketType = {
  readonly id: string;
  readonly maxPerRegistration: number;
  readonly name: string;
  readonly pricePoisha: number;
  readonly quantityTotal: number;
};

export type SeededEvent = {
  readonly id: string;
  readonly organiserId: string;
  readonly slug: string;
  readonly startsAt: number;
  readonly ticketTypes: readonly SeededTicketType[];
  readonly title: string;
};

export type SeededEvents = {
  readonly cancelled: SeededEvent;
  readonly draft: SeededEvent;
  readonly published: SeededEvent;
};

export type EventsDeps = {
  readonly db: SeedDb;
  /** 12:00 Asia/Dhaka on the anchor date, so `+6h` lands on 18:00. */
  readonly now: number;
  readonly organiserId: string;
  readonly rng: Rng;
};

type EventPlan = {
  readonly city: string;
  readonly description: string;
  readonly durationHours: number;
  readonly slug: string;
  readonly startsInDays: number;
  readonly status: "cancelled" | "draft" | "published";
  readonly title: string;
  readonly types: readonly Omit<SeededTicketType, "id">[];
  readonly venue: string;
};

const PLANS = {
  cancelled: {
    city: "Sylhet",
    description:
      "Cancelled by the organiser. Seeded so the cancellation sweep has something to walk.",
    durationHours: 8,
    slug: "sylhet-tea-garden-run",
    startsInDays: 21,
    status: "cancelled",
    title: "Sylhet Tea Garden Trail Run",
    types: [
      {
        maxPerRegistration: 4,
        name: "Runner",
        pricePoisha: 80_000,
        quantityTotal: 150,
      },
    ],
    venue: "Malnicherra Tea Estate",
  },
  draft: {
    city: "Chattogram",
    description:
      "Unpublished. Invisible to everyone but its organiser, and no one can register against it.",
    durationHours: 5,
    slug: "chattogram-startup-night",
    startsInDays: 34,
    status: "draft",
    title: "Chattogram Startup Night",
    types: [
      {
        maxPerRegistration: 6,
        name: "Standard",
        pricePoisha: 60_000,
        quantityTotal: 120,
      },
    ],
    venue: "Radisson Blu Chattogram Bay View",
  },
  published: {
    city: "Dhaka",
    description:
      "Two ticket types on purpose: a multi-line hold is the reservation batch worth reading.",
    durationHours: 10,
    slug: "dhaka-tech-summit-2026",
    startsInDays: 12,
    status: "published",
    title: "Dhaka Tech Summit 2026",
    types: [
      {
        maxPerRegistration: 10,
        name: "General Admission",
        pricePoisha: 125_000,
        quantityTotal: 200,
      },
      {
        maxPerRegistration: 4,
        name: "VIP",
        pricePoisha: 500_000,
        quantityTotal: 20,
      },
    ],
    venue: "Bangabandhu International Conference Centre",
  },
} as const satisfies Record<string, EventPlan>;

function insertEvent(deps: EventsDeps, plan: EventPlan): SeededEvent {
  const { db, now, organiserId, rng } = deps;
  const id = rng.id("evt_");
  const createdAt = now - (plan.startsInDays + 10) * DAY_MS;
  const startsAt = now + plan.startsInDays * DAY_MS + 6 * HOUR_MS;

  db.insert(events)
    .values({
      city: plan.city,
      createdAt,
      description: plan.description,
      endsAt: startsAt + plan.durationHours * HOUR_MS,
      id,
      organiserId,
      publishedAt: plan.status === "draft" ? null : createdAt + DAY_MS,
      slug: plan.slug,
      startsAt,
      status: plan.status,
      title: plan.title,
      updatedAt: createdAt + DAY_MS,
      venue: plan.venue,
    })
    .run();

  const seededTypes = plan.types.map((type, index) => {
    const typeId = rng.id("tty_");
    db.insert(ticketTypes)
      .values({
        createdAt,
        eventId: id,
        id: typeId,
        maxPerRegistration: type.maxPerRegistration,
        name: type.name,
        pricePoisha: type.pricePoisha,
        // Starts at 0: `buildRegistrations` moves it through the same guarded claim the API uses.
        quantityClaimed: 0,
        quantityTotal: type.quantityTotal,
        sortOrder: index,
        updatedAt: createdAt,
      })
      .run();
    return { ...type, id: typeId };
  });

  return {
    id,
    organiserId,
    slug: plan.slug,
    startsAt,
    ticketTypes: seededTypes,
    title: plan.title,
  };
}

export function buildEvents(deps: EventsDeps): SeededEvents {
  return {
    cancelled: insertEvent(deps, PLANS.cancelled),
    draft: insertEvent(deps, PLANS.draft),
    published: insertEvent(deps, PLANS.published),
  };
}
