import type { EventId, TicketTypeId } from "@gc/domain/Domain/Ids";
import type { TicketTypeAvailability } from "@gc/domain/Domain/TicketType";
import { normaliseMsisdn } from "@gc/shared/bd";
import { formatPoisha } from "@gc/shared/money";
import { formatDhakaDateTime } from "@gc/shared/time";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";
import {
  eventQuery,
  hasTag,
  invalidate,
  invalidationKeys,
  registerMutation,
} from "@web/lib/api";
import { type FormEvent, useState } from "react";

// `available` and `soldOut` arrive derived, and are only a hint: the authoritative answer is the
// 409 `SoldOut` the seat claim may return even when this page believed a seat was free.
export const Route = createFileRoute("/events/$eventId")({
  component: EventDetailPage,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(eventQuery(params.eventId as EventId)),
});

function EventDetailPage() {
  const { eventId } = Route.useParams();
  const { session } = useRouteContext({ from: "__root__" });
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: event } = useQuery(eventQuery(eventId as EventId));
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [name, setName] = useState(session?.user.name ?? "");
  const [phone, setPhone] = useState("");
  const [soldOutIds, setSoldOutIds] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const register = useMutation({
    ...registerMutation(),
    // The failure names the ticket types that ran out, so the form renders it inline.
    meta: { inlineError: true },
  });

  if (!event) {
    return <main className="mx-auto max-w-2xl px-4 py-8">Loading…</main>;
  }

  const lines = Object.entries(quantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([ticketTypeId, quantity]) => ({
      quantity,
      ticketTypeId: ticketTypeId as TicketTypeId,
    }));

  const total = event.ticketTypes.reduce(
    (sum, type) => sum + type.pricePoisha * (quantities[type.id] ?? 0),
    0
  );

  const submit = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    setError(null);
    setSoldOutIds([]);

    // The API takes `8801XXXXXXXXX` and nothing else; users type `01712…`/`+8801712…` freely.
    const msisdn = normaliseMsisdn(phone);
    if (msisdn === null) {
      setError("Enter a Bangladeshi mobile number, e.g. 01712345678.");
      return;
    }

    try {
      const registration = await register.mutateAsync({
        body: { attendeeName: name, attendeePhone: msisdn, lines },
        eventId: eventId as EventId,
      });
      // The seats are claimed: leaving the cache means the back button shows them still free.
      await invalidate(
        queryClient,
        invalidationKeys.register(eventId as EventId)
      );
      await router.navigate({
        params: { registrationId: registration.id },
        to: "/registrations/$registrationId",
      });
    } catch (caught) {
      if (hasTag(caught, "SoldOut")) {
        const details = (caught as { details?: Record<string, unknown> })
          .details;
        const ids = details?.ticketTypeIds;
        setSoldOutIds(Array.isArray(ids) ? (ids as string[]) : []);
        // Evict BEFORE `router.invalidate()`: the loader is `ensureQueryData`, which would answer
        // from the still-fresh entry and leave the contradicted number on screen.
        await invalidate(
          queryClient,
          invalidationKeys.register(eventId as EventId)
        );
        await router.invalidate();
        setError("Someone took the last of those while you were deciding.");
        return;
      }
      setError(
        caught instanceof Error ? caught.message : "Could not hold seats"
      );
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-semibold text-2xl">{event.title}</h1>
      <p className="mt-1 text-muted text-sm">
        {formatDhakaDateTime(event.startsAt)} →{" "}
        {formatDhakaDateTime(event.endsAt)}
      </p>
      <p className="text-muted text-sm">
        {event.venue}, {event.city}
      </p>
      {event.description ? (
        <p className="mt-4 text-sm">{event.description}</p>
      ) : null}

      {event.status !== "published" && (
        <p className="mt-6 evb-card text-bad text-sm">
          This event is {event.status}. Registration is closed.
        </p>
      )}

      <form className="mt-8 grid gap-4" onSubmit={submit}>
        <fieldset
          className="grid gap-2"
          disabled={event.status !== "published"}
        >
          <legend className="font-medium">Tickets</legend>
          {event.ticketTypes.map((type) => (
            <TicketTypeRow
              key={type.id}
              onChange={(quantity) =>
                setQuantities((current) => ({
                  ...current,
                  [type.id]: quantity,
                }))
              }
              quantity={quantities[type.id] ?? 0}
              soldOutNow={soldOutIds.includes(type.id)}
              type={type}
            />
          ))}
        </fieldset>

        <p className="text-sm">
          Total <span className="font-medium">{formatPoisha(total)}</span>
        </p>

        {session ? (
          <>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Attendee name</span>
              <input
                className="evb-field"
                onChange={(changed) => setName(changed.currentTarget.value)}
                required
                value={name}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted">Mobile number (bKash)</span>
              <input
                className="evb-field"
                inputMode="tel"
                onChange={(changed) => setPhone(changed.currentTarget.value)}
                placeholder="01712345678"
                required
                value={phone}
              />
            </label>
            <button
              className="evb-button"
              disabled={
                lines.length === 0 ||
                register.isPending ||
                event.status !== "published"
              }
              type="submit"
            >
              {register.isPending ? "Holding seats…" : "Hold seats"}
            </button>
            <p className="text-muted text-xs">
              Holding does not charge you. The seats are yours for a few minutes
              while you pay.
            </p>
          </>
        ) : (
          <Link
            className="evb-button w-fit"
            search={{ redirect: `/events/${eventId}` }}
            to="/login"
          >
            Sign in to register
          </Link>
        )}

        {error ? <p className="text-bad text-sm">{error}</p> : null}
      </form>
    </main>
  );
}

const TicketTypeRow = ({
  onChange,
  quantity,
  soldOutNow,
  type,
}: {
  readonly onChange: (quantity: number) => void;
  readonly quantity: number;
  readonly soldOutNow: boolean;
  readonly type: TicketTypeAvailability;
}) => {
  // Cap at what is actually left, so the picker cannot offer a quantity the claim will reject.
  const max = Math.min(type.maxPerRegistration, type.available);

  return (
    <div className="evb-card flex items-center justify-between gap-4">
      <div>
        <p className="font-medium text-sm">{type.name}</p>
        <p className="text-muted text-xs">
          {formatPoisha(type.pricePoisha)} ·{" "}
          {type.soldOut ? "sold out" : `${type.available} left`}
          {soldOutNow ? (
            <span className="text-bad"> · just taken by someone else</span>
          ) : null}
        </p>
      </div>
      <input
        aria-label={`Quantity of ${type.name}`}
        className="evb-field w-20"
        disabled={type.soldOut || max === 0}
        max={max}
        min={0}
        onChange={(changed) =>
          onChange(
            Math.max(0, Math.min(max, changed.currentTarget.valueAsNumber || 0))
          )
        }
        type="number"
        value={quantity}
      />
    </div>
  );
};
