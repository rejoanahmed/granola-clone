import type {
  bkashCallbackRoute,
  bkashWebhookRoute,
  createCheckoutRoute,
  getPaymentRoute,
  refundPaymentRoute,
} from "@evb/domain/Payment/Contract";
import type { Endpoint } from "./client";

// Type-only imports, for the reason given in `events.ts`.
export const makePaymentsApi = (endpoint: Endpoint) => ({
  // bKash navigates the payer's browser here; no app fetches it. The only route answering no JSON,
  // so the only one carrying `{ raw: true }` — `ResultOf` derives its `Response` from that absence.
  bkashCallback: endpoint<typeof bkashCallbackRoute>(
    "get",
    "/payments/bkash/callback",
    { raw: true }
  ),
  // The route declares no request body on purpose: a body validator re-serialises the bytes and
  // every HMAC then fails. Callers pass the raw bytes through the options argument instead.
  bkashWebhook: endpoint<typeof bkashWebhookRoute>(
    "post",
    "/payments/bkash/webhook"
  ),
  /** Idempotent: a partial unique index caps live payments per registration, so retry is safe. */
  createCheckout: endpoint<typeof createCheckoutRoute>(
    "post",
    "/registrations/{registrationId}/payment"
  ),
  getPayment: endpoint<typeof getPaymentRoute>("get", "/payments/{paymentId}"),
  refundPayment: endpoint<typeof refundPaymentRoute>(
    "post",
    "/organiser/payments/{paymentId}/refund"
  ),
});
