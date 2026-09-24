import { poisha } from "@evb/domain/Domain/Money";
import type { CreateTicketType } from "@evb/domain/Domain/TicketType";
import { BD_DISTRICTS } from "@evb/shared/bd";
import { poishaFromTaka } from "@evb/shared/money";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  addTicketTypeMutation,
  createEventMutation,
  invalidate,
  invalidationKeys,
} from "@web/lib/api";
import { type FormEvent, useState } from "react";

// Two endpoints in sequence, deliberately not atomic: a draft is inert, and `publish` refuses an
// event with no saleable ticket type — so a failed `addTicketType` just leaves one to add again.
export const Route = createFileRoute("/organiser/events/new")({
  component: NewEvent,
});

type TicketDraft = {
  maxPerRegistration: number;
  name: string;
  priceTaka: number;
  quantityTotal: number;
};

const emptyTicket = (): TicketDraft => ({
  maxPerRegistration: 10,
  name: "",
  priceTaka: 500,
  quantityTotal: 100,
});

/** `datetime-local` gives a wall-clock string in the BROWSER's zone; the API wants epoch ms. */
const toEpochMs = (local: string): number => new Date(local).getTime();

function NewEvent() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("Dhaka");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [tickets, setTickets] = useState<TicketDraft[]>([emptyTicket()]);
  const [error, setError] = useState<string | null>(null);

  const createEvent = useMutation({
    ...createEventMutation(),
    meta: { inlineError: true },
  });
  const addTicketType = useMutation({
    ...addTicketTypeMutation(),
    meta: { inlineError: true },
  });

  const patchTicket = (index: number, patch: Partial<TicketDraft>) =>
    setTickets((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const start = toEpochMs(startsAt);
    const end = toEpochMs(endsAt);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      setError("The event must end after it starts.");
      return;
    }

    try {
      const created = await createEvent.mutateAsync({
        city,
        description: description || null,
        endsAt: end,
        startsAt: start,
        title,
        venue,
      });

      // Sequential, not `Promise.all`: `ticket_types` is uniquely indexed on (event_id, name), so
      // concurrent inserts of a duplicated name race to a violation whose loser is arbitrary.
      for (const [position, row] of tickets.entries()) {
        const body: CreateTicketType = {
          maxPerRegistration: row.maxPerRegistration,
          name: row.name,
          // The one place taka becomes poisha: `poisha()` re-parses, so a float or out-of-range
          // figure throws here rather than being cast into a branded type that lies (D002).
          pricePoisha: poisha(poishaFromTaka(row.priceTaka)),
          quantityTotal: row.quantityTotal,
          sortOrder: position,
        };
        // biome-ignore lint/performance/noAwaitInLoops: ordering is the point — see above
        await addTicketType.mutateAsync({ body, eventId: created.id });
      }

      await invalidate(queryClient, [
        ...invalidationKeys.createEvent(),
        ...invalidationKeys.addTicketType(created.id),
      ]);
      await router.navigate({
        params: { eventId: created.id },
        to: "/organiser/events/$eventId",
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create the event"
      );
    }
  };

  const busy = createEvent.isPending || addTicketType.isPending;

  return (
    <section className="mt-6">
      <h1 className="font-semibold text-2xl">New event</h1>
      <p className="mt-1 text-muted text-sm">
        Saved as a draft. Nobody can see it or buy a ticket until you publish.
      </p>

      <form className="mt-6 grid gap-4" onSubmit={submit}>
        <label className="grid gap-1 text-sm">
          <span className="text-muted">Title</span>
          <input
            className="evb-field"
            minLength={3}
            onChange={(changed) => setTitle(changed.currentTarget.value)}
            required
            value={title}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Venue</span>
            <input
              className="evb-field"
              onChange={(changed) => setVenue(changed.currentTarget.value)}
              required
              value={venue}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">City</span>
            <select
              className="evb-field"
              onChange={(changed) => setCity(changed.currentTarget.value)}
              value={city}
            >
              {BD_DISTRICTS.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Starts</span>
            <input
              className="evb-field"
              onChange={(changed) => setStartsAt(changed.currentTarget.value)}
              required
              type="datetime-local"
              value={startsAt}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Ends</span>
            <input
              className="evb-field"
              onChange={(changed) => setEndsAt(changed.currentTarget.value)}
              required
              type="datetime-local"
              value={endsAt}
            />
          </label>
        </div>
        <p className="text-muted text-xs">
          Times are read from this device's clock and sent as epoch
          milliseconds. Everything the app displays back is formatted in
          Asia/Dhaka.
        </p>

        <label className="grid gap-1 text-sm">
          <span className="text-muted">Description</span>
          <textarea
            className="evb-field"
            onChange={(changed) => setDescription(changed.currentTarget.value)}
            rows={4}
            value={description}
          />
        </label>

        <fieldset className="grid gap-3">
          <legend className="font-medium text-sm">Ticket types</legend>
          {tickets.map((row, i) => (
            <div
              className="evb-card grid gap-3 sm:grid-cols-4"
              // biome-ignore lint/suspicious/noArrayIndexKey: draft rows have no id until saved
              key={i}
            >
              <label className="grid gap-1 text-xs sm:col-span-2">
                <span className="text-muted">Name</span>
                <input
                  className="evb-field"
                  onChange={(changed) =>
                    patchTicket(i, { name: changed.currentTarget.value })
                  }
                  required
                  value={row.name}
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-muted">Price (৳)</span>
                <input
                  className="evb-field"
                  min={1}
                  onChange={(changed) =>
                    patchTicket(i, {
                      priceTaka: changed.currentTarget.valueAsNumber || 0,
                    })
                  }
                  required
                  step="0.01"
                  type="number"
                  value={row.priceTaka}
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-muted">Quantity</span>
                <input
                  className="evb-field"
                  min={1}
                  onChange={(changed) =>
                    patchTicket(i, {
                      quantityTotal: changed.currentTarget.valueAsNumber || 0,
                    })
                  }
                  required
                  type="number"
                  value={row.quantityTotal}
                />
              </label>
            </div>
          ))}
          <button
            className="evb-button w-fit"
            onClick={() => setTickets((current) => [...current, emptyTicket()])}
            type="button"
          >
            Add another ticket type
          </button>
        </fieldset>

        <button className="evb-button w-fit" disabled={busy} type="submit">
          {busy ? "Saving…" : "Save draft"}
        </button>
        {error ? <p className="text-bad text-sm">{error}</p> : null}
      </form>
    </section>
  );
}
