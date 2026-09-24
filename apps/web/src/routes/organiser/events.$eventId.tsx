import type { EventId, TicketTypeId } from "@gc/domain/Domain/Ids";
import { poisha } from "@gc/domain/Domain/Money";
import { formatPoisha, poishaFromTaka } from "@gc/shared/money";
import { formatDhakaDateTime } from "@gc/shared/time";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  addTicketTypeMutation,
  attendeesQuery,
  cancelEventMutation,
  invalidate,
  invalidationKeys,
  myEventQuery,
  publishEventMutation,
  updateEventMutation,
  updateTicketTypeMutation,
} from "@web/lib/api";
import { type FormEvent, useState } from "react";

// Status gates every control: a draft is editable, a published event is frozen except for raising
// `quantityTotal`, a cancelled one is terminal. The server enforces it; this page only declines to
// offer what would be refused.
export const Route = createFileRoute("/organiser/events/$eventId")({
  component: OrganiserEvent,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      myEventQuery(params.eventId as EventId)
    ),
});

function OrganiserEvent() {
  const { eventId } = Route.useParams();
  const id = eventId as EventId;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: event } = useQuery(myEventQuery(id));
  const { data: attendees } = useQuery(attendeesQuery(id));

  const publish = useMutation(publishEventMutation());
  const cancel = useMutation(cancelEventMutation());
  const update = useMutation(updateEventMutation());
  const addType = useMutation(addTicketTypeMutation());
  const updateType = useMutation(updateTicketTypeMutation());

  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeTaka, setNewTypeTaka] = useState(500);
  const [newTypeQty, setNewTypeQty] = useState(100);

  if (!event) {
    return <p className="mt-6 text-muted text-sm">Loading…</p>;
  }

  const isDraft = event.status === "draft";

  const refresh = async (keys: readonly (readonly unknown[])[]) => {
    await invalidate(queryClient, keys);
    await router.invalidate();
  };

  const onPublish = async () => {
    await publish.mutateAsync({ eventId: id });
    await refresh(invalidationKeys.publishEvent(id));
  };

  const onCancel = async () => {
    await cancel.mutateAsync({ eventId: id });
    await refresh(invalidationKeys.cancelEvent());
  };

  const onRename = async (submit: FormEvent<HTMLFormElement>) => {
    submit.preventDefault();
    const form = new FormData(submit.currentTarget);
    await update.mutateAsync({
      body: {
        city: String(form.get("city") ?? event.city),
        title: String(form.get("title") ?? event.title),
        venue: String(form.get("venue") ?? event.venue),
      },
      eventId: id,
    });
    await refresh(invalidationKeys.updateEvent(id));
  };

  const onAddType = async (submit: FormEvent) => {
    submit.preventDefault();
    await addType.mutateAsync({
      body: {
        maxPerRegistration: 10,
        name: newTypeName,
        // The field holds taka; `poisha()` re-parses, so a fractional or out-of-range figure
        // throws here instead of reaching the API branded.
        pricePoisha: poisha(poishaFromTaka(newTypeTaka)),
        quantityTotal: newTypeQty,
        sortOrder: event.ticketTypes.length,
      },
      eventId: id,
    });
    setNewTypeName("");
    await refresh(invalidationKeys.addTicketType(id));
  };

  const onRaiseQuantity = async (
    ticketTypeId: TicketTypeId,
    quantityTotal: number
  ) => {
    await updateType.mutateAsync({
      body: { quantityTotal },
      eventId: id,
      ticketTypeId,
    });
    await refresh(invalidationKeys.updateTicketType(id));
  };

  return (
    <section className="mt-6 grid gap-8">
      <header>
        <p className="text-muted text-xs uppercase tracking-wide">
          {event.status}
        </p>
        <h1 className="font-semibold text-2xl">{event.title}</h1>
        <p className="mt-1 text-muted text-sm">
          {formatDhakaDateTime(event.startsAt)} · {event.venue}, {event.city}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {isDraft && (
            <button
              className="evb-button"
              disabled={publish.isPending}
              onClick={onPublish}
              type="button"
            >
              Publish
            </button>
          )}
          {event.status !== "cancelled" && (
            <button
              className="evb-button text-bad"
              disabled={cancel.isPending}
              onClick={onCancel}
              type="button"
            >
              Cancel event
            </button>
          )}
        </div>
        {isDraft && (
          <p className="mt-2 text-muted text-xs">
            Publishing needs at least one ticket type with stock and a start
            time in the future.
          </p>
        )}
      </header>

      {isDraft && (
        <form className="evb-card grid gap-3" onSubmit={onRename}>
          <h2 className="font-medium text-sm">Details</h2>
          <input
            className="evb-field"
            defaultValue={event.title}
            name="title"
            required
          />
          <input
            className="evb-field"
            defaultValue={event.venue}
            name="venue"
            required
          />
          <input
            className="evb-field"
            defaultValue={event.city}
            name="city"
            required
          />
          <button
            className="evb-button w-fit"
            disabled={update.isPending}
            type="submit"
          >
            Save
          </button>
        </form>
      )}

      <div>
        <h2 className="font-medium">Ticket types</h2>
        <ul className="mt-3 grid gap-2">
          {event.ticketTypes.map((type) => {
            // `quantityClaimed` never crosses the wire; derive it from the two numbers that do.
            const claimed = type.quantityTotal - type.available;
            return (
              <li
                className="evb-card flex flex-wrap items-center justify-between gap-3"
                key={type.id}
              >
                <span>
                  <span className="block font-medium text-sm">{type.name}</span>
                  <span className="text-muted text-xs">
                    {formatPoisha(type.pricePoisha)} · {claimed} of{" "}
                    {type.quantityTotal} taken
                    {type.soldOut ? " · sold out" : ""}
                  </span>
                </span>
                {event.status !== "cancelled" && (
                  <button
                    className="evb-button"
                    disabled={updateType.isPending}
                    onClick={() =>
                      onRaiseQuantity(type.id, type.quantityTotal + 10)
                    }
                    type="button"
                  >
                    +10 seats
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {isDraft && (
          <form
            className="evb-card mt-3 grid gap-3 sm:grid-cols-4"
            onSubmit={onAddType}
          >
            <label className="grid gap-1 text-xs sm:col-span-2">
              <span className="text-muted">Name</span>
              <input
                className="evb-field"
                onChange={(changed) =>
                  setNewTypeName(changed.currentTarget.value)
                }
                required
                value={newTypeName}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted">Price (৳)</span>
              <input
                className="evb-field"
                min={1}
                onChange={(changed) =>
                  setNewTypeTaka(changed.currentTarget.valueAsNumber || 0)
                }
                step="0.01"
                type="number"
                value={newTypeTaka}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted">Quantity</span>
              <input
                className="evb-field"
                min={1}
                onChange={(changed) =>
                  setNewTypeQty(changed.currentTarget.valueAsNumber || 0)
                }
                type="number"
                value={newTypeQty}
              />
            </label>
            <button
              className="evb-button w-fit sm:col-span-4"
              disabled={addType.isPending}
              type="submit"
            >
              Add ticket type
            </button>
          </form>
        )}
      </div>

      <div>
        <h2 className="font-medium">Door list</h2>
        <p className="mt-1 text-muted text-sm">
          One row per confirmed registration. A pending hold is not an attendee
          until it is paid for.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-muted text-xs">
            <tr>
              <th className="py-1">Name</th>
              <th className="py-1">Phone</th>
              <th className="py-1">Tickets</th>
              <th className="py-1">Checked in</th>
            </tr>
          </thead>
          <tbody>
            {attendees?.items.map((row) => (
              <tr className="border-line border-t" key={row.registrationId}>
                <td className="py-1">{row.attendeeName}</td>
                <td className="py-1 font-mono text-xs">{row.attendeePhone}</td>
                <td className="py-1">{row.ticketCount}</td>
                <td className="py-1">{row.checkedInCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {attendees?.items.length === 0 && (
          <p className="mt-2 text-muted text-sm">Nobody yet.</p>
        )}
      </div>
    </section>
  );
}
