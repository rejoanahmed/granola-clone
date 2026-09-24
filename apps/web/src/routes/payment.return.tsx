import type { PaymentId, RegistrationId } from "@gc/domain/Domain/Ids";
import type { PaymentStatus } from "@gc/domain/Domain/Payment";
import { formatPoisha } from "@gc/shared/money";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { TicketCard } from "@web/components/ticket-qr";
import { paymentQuery, queryDefaults, registrationQuery } from "@web/lib/api";

// Settlement happens server-side in the API's bKash callback, under the `executing` lease — the
// `outcome` in this URL is only a hint, so this page polls the payment row until it is terminal.
export const Route = createFileRoute("/payment/return")({
  component: PaymentReturn,
  validateSearch: (search: Record<string, unknown>) => ({
    outcome: typeof search.outcome === "string" ? search.outcome : null,
    paymentId:
      typeof search.paymentId === "string"
        ? (search.paymentId as PaymentId)
        : null,
  }),
});

const SETTLING: readonly PaymentStatus[] = ["initiated", "executing"];

function PaymentReturn() {
  const { outcome, paymentId } = Route.useSearch();

  const payment = useQuery({
    ...paymentQuery(paymentId ?? ("pay_placeholder" as PaymentId)),
    enabled: paymentId !== null,
    refetchInterval: (query) =>
      SETTLING.includes(query.state.data?.status as PaymentStatus)
        ? queryDefaults.paymentPollMs
        : false,
  });

  const settled = payment.data;
  const succeeded = settled?.status === "succeeded";

  // Guarded by `enabled` rather than an early return because hooks cannot be conditional; the
  // placeholder id is never fetched.
  const registration = useQuery({
    ...registrationQuery(
      (settled?.registrationId ?? "reg_placeholder") as RegistrationId
    ),
    enabled: succeeded && settled?.registrationId != null,
  });

  if (paymentId === null) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-semibold text-2xl">No payment to show</h1>
        <Link className="evb-button mt-4" to="/me/registrations">
          My tickets
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      {(payment.isPending ||
        SETTLING.includes(settled?.status as PaymentStatus)) && (
        <>
          <h1 className="font-semibold text-2xl">Confirming your payment…</h1>
          <p className="mt-2 text-muted text-sm">
            bKash said “{outcome ?? "…"}”. We are waiting for the payment to
            settle on our side — this page updates itself.
          </p>
        </>
      )}

      {settled && !SETTLING.includes(settled.status) && (
        <>
          <h1 className="font-semibold text-2xl">
            {succeeded ? "Paid" : `Payment ${settled.status}`}
          </h1>
          <p className="mt-2 text-muted text-sm">
            {formatPoisha(settled.amountPoisha)}
            {settled.bkashTrxId ? ` · trx ${settled.bkashTrxId}` : ""}
          </p>
          {settled.failureMessage ? (
            <p className="mt-2 text-bad text-sm">{settled.failureMessage}</p>
          ) : null}
        </>
      )}

      {succeeded && registration.data ? (
        <section className="mt-8">
          <h2 className="font-medium">
            Your {registration.data.tickets.length === 1 ? "ticket" : "tickets"}
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {registration.data.tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </ul>
          <Link
            className="evb-button mt-6"
            params={{ registrationId: registration.data.id }}
            to="/registrations/$registrationId"
          >
            Open this order
          </Link>
        </section>
      ) : null}

      {/* Succeeded with no tickets: the hold expired before bKash answered and the API opened an
        automatic refund. */}
      {succeeded &&
        registration.data &&
        registration.data.tickets.length === 0 && (
          <p className="evb-card mt-6 text-sm text-warn">
            Your seats were released before the payment landed, so no tickets
            were issued. A refund has been opened automatically.
          </p>
        )}
    </main>
  );
}
