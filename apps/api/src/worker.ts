import { buildContainer, type Env } from "@evb/server";
import { app } from "./app";

export default {
  fetch: app.fetch,

  // The cron composes use cases off the same container `fetch` builds — it touches no repository
  // and opens no unit of work.
  // Order matters: holds are swept first so the seats are back before payments are re-queried, and
  // a payment settling against a just-swept hold is the "not-holdable" case that opens a refund.
  scheduled: (_event, env, ctx) => {
    const svc = buildContainer(env);
    ctx.waitUntil(
      (async () => {
        await svc.tickets.sweepExpiredHolds(200);
        await svc.payments.sweepStale(100);
        const { refundable } = await svc.tickets.sweepCancelledEvents(200);
        for (const id of refundable) {
          await svc.payments.refundForRegistration(id, "event_cancelled");
        }
      })()
    );
  },
} satisfies ExportedHandler<Env>;
