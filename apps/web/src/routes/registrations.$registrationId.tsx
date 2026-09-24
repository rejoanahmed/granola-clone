import type { RegistrationId } from "@evb/domain/Domain/Ids";
import { formatPoisha } from "@evb/shared/money";
import { formatDhakaDateTime } from "@evb/shared/time";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { TicketCard } from "@web/components/ticket-qr";
import {
  cancelRegistrationMutation,
  createCheckoutMutation,
  invalidate,
  invalidationKeys,
  registrationQuery,
} from "@web/lib/api";
import { useEffect, useState } from "react";

// There is no email or SMS: this page IS ticket delivery, which is why the codes are random rather
// than derived from the registration id.
export const Route = createFileRoute("/registrations/$registrationId")({
  component: RegistrationPage,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      registrationQuery(params.registrationId as RegistrationId)
    ),
});

function RegistrationPage() {
  const { registrationId } = Route.useParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: registration } = useQuery(
    registrationQuery(registrationId as RegistrationId)
  );

  const checkout = useMutation(createCheckoutMutation());
  const cancel = useMutation(cancelRegistrationMutation());

  if (!registration) {
    return <main className="mx-auto max-w-2xl px-4 py-8">Loading…</main>;
  }

  const pay = async () => {
    const result = await checkout.mutateAsync({
      registrationId: registrationId as RegistrationId,
    });
    // A full navigation, not a fetch. Asking twice is safe by construction: a partial unique index
    // permits one live payment per registration and the API returns the existing `bkashUrl`.
    globalThis.location.assign(result.bkashUrl);
  };

  const abandon = async () => {
    await cancel.mutateAsync({
      registrationId: registrationId as RegistrationId,
    });
    // Both ids: the seats go back on the event's availability, which is keyed by event not order.
    await invalidate(
      queryClient,
      invalidationKeys.cancelRegistration(registration.id, registration.eventId)
    );
    await router.invalidate();
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-semibold text-2xl">{registration.event.title}</h1>
      <p className="mt-1 text-muted text-sm">
        {formatDhakaDateTime(registration.event.startsAt)} ·{" "}
        {registration.event.venue}, {registration.event.city}
      </p>

      <section className="evb-card mt-6">
        <p className="text-muted text-sm">Order</p>
        <ul className="mt-2 grid gap-1 text-sm">
          {registration.items.map((item) => (
            <li className="flex justify-between" key={item.ticketTypeId}>
              <span>
                {item.quantity} ×{" "}
                <span className="font-mono text-xs">{item.ticketTypeId}</span>
              </span>
              <span>{formatPoisha(item.unitPricePoisha * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between border-line border-t pt-3 font-medium text-sm">
          <span>Total</span>
          <span>{formatPoisha(registration.totalPoisha)}</span>
        </p>
      </section>

      {registration.status === "pending" && (
        <section className="evb-card mt-4 grid gap-3">
          <HoldCountdown remainingMs={registration.holdExpiresInMs} />
          <button
            className="evb-button"
            disabled={checkout.isPending}
            onClick={pay}
            type="button"
          >
            {checkout.isPending ? "Opening bKash…" : "Pay with bKash"}
          </button>
          <button
            className="text-muted text-sm underline"
            disabled={cancel.isPending}
            onClick={abandon}
            type="button"
          >
            Release these seats
          </button>
        </section>
      )}

      {registration.status === "confirmed" && (
        <section className="mt-6">
          <h2 className="font-medium">
            Your {registration.tickets.length === 1 ? "ticket" : "tickets"}
          </h2>
          <p className="mt-1 text-muted text-sm">
            Show the code at the gate. It can also be read aloud — the alphabet
            has no I, L, O or U for exactly that reason.
          </p>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {registration.tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </ul>
        </section>
      )}

      {registration.status !== "pending" &&
        registration.status !== "confirmed" && (
          <p className="evb-card mt-4 text-sm">
            This registration is <strong>{registration.status}</strong>
            {registration.releaseReason
              ? ` (${registration.releaseReason.replace("_", " ")})`
              : ""}
            . The seats have gone back to the pool.
          </p>
        )}
    </main>
  );
}

// A duration against the API's clock, not an absolute time: a device clock nine minutes fast would
// show an expired hold on a live seat. At zero it only notifies — expiry is the sweeper's job.
const HoldCountdown = ({ remainingMs }: { readonly remainingMs: number }) => {
  const [left, setLeft] = useState(remainingMs);

  useEffect(() => {
    setLeft(remainingMs);
    const timer = setInterval(
      () => setLeft((current) => Math.max(0, current - 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, [remainingMs]);

  if (left <= 0) {
    return (
      <p className="text-bad text-sm">
        This hold has run out. Refresh — the seats may already be back on sale.
      </p>
    );
  }

  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return (
    <p className="text-sm text-warn">
      Seats held for{" "}
      <span className="font-mono">
        {minutes}:{String(seconds).padStart(2, "0")}
      </span>
    </p>
  );
};
