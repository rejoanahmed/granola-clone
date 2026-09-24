import { createRoute, z } from "@hono/zod-openapi";
import { PaymentId, RegistrationId } from "../Domain/Ids";
import {
  BkashCallbackQuery,
  Checkout,
  Payment,
  RefundInput,
  WebhookAck,
} from "../Domain/Payment";
import { commonErrors, ErrorBody, json, jsonBody, params } from "../Http";

// The 402/502 split: 502 `BkashUnavailable` means "ask again later" and `sweepStale` will re-query;
// 402 `BkashRejected` means bKash settled on a refusal and retrying changes nothing. Both can
// happen on `createCheckout` and `refund`, so both routes declare both.

const { 401: unauthorized, 403: forbidden, 422: unprocessable } = commonErrors;

const paymentNotFound = json(ErrorBody, "Payment not found");
const bkashUnavailable = json(ErrorBody, "bKash did not answer");
const bkashRejected = json(ErrorBody, "bKash refused the request");

const ATTENDEE_TAG = "Payments";
const ORGANISER_TAG = "Organiser · Payments";

export const createCheckoutRoute = createRoute({
  description:
    "Opens one bKash tokenized checkout for a pending registration. Calling it twice answers the SAME `bkashUrl`: a partial unique index permits at most one live payment per registration, and the violation is caught and turned into the existing checkout rather than a second charge.",
  method: "post",
  path: "/registrations/{registrationId}/payment",
  request: { params: params({ registrationId: RegistrationId }) },
  responses: {
    201: json(Checkout, "The checkout to send the payer to"),
    401: unauthorized,
    402: bkashRejected,
    403: forbidden,
    404: json(ErrorBody, "Registration not found"),
    409: json(ErrorBody, "Registration is not payable"),
    422: unprocessable,
    502: bkashUnavailable,
  },
  summary: "Open a bKash checkout",
  tags: [ATTENDEE_TAG],
});

export const bkashCallbackRoute = createRoute({
  description:
    "The browser redirect back from bKash. Settles the payment and redirects to `<APP_URL>/payment/return?paymentId=…&outcome=…`.",
  method: "get",
  path: "/payments/bkash/callback",
  request: { query: BkashCallbackQuery },
  responses: {
    302: {
      description: "Redirect to the web app's payment-return page",
      headers: z.object({ Location: z.string() }),
    },
    404: paymentNotFound,
    422: unprocessable,
    // `handleCallback` crosses to bKash before it can name an outcome; a failure there means we do
    // not yet know whether the money moved, so the payer gets the envelope, not a redirect.
    502: bkashUnavailable,
  },
  summary: "bKash redirect callback",
  tags: [ATTENDEE_TAG],
});

// No `request.body` on purpose: a declared body installs a validator that reads the request first,
// after which `c.req.text()` returns re-serialised bytes and every HMAC check fails. The header is
// optional so a missing signature answers `InvalidWebhookSignature`, not a validator rejection.
export const bkashWebhookRoute = createRoute({
  description:
    "bKash's server-to-server notification. Body is `BkashWebhookBody` as raw JSON bytes; `x-bkash-signature` is HMAC-SHA256 of those bytes under `BKASH_WEBHOOK_SECRET`. Answers 200 for every outcome except a bad or missing signature — a 5xx on our own bug would make bKash retry forever.",
  method: "post",
  path: "/payments/bkash/webhook",
  request: {
    headers: z.object({ "x-bkash-signature": z.string().optional() }),
  },
  responses: {
    200: json(
      WebhookAck,
      "Acknowledged: applied, duplicate, unmatched or rejected"
    ),
    401: json(ErrorBody, "Missing or invalid webhook signature"),
  },
  summary: "bKash webhook",
  tags: [ATTENDEE_TAG],
});

export const getPaymentRoute = createRoute({
  description:
    "What the payment-return page polls. Readable by the attendee who owns the registration.",
  method: "get",
  path: "/payments/{paymentId}",
  request: { params: params({ paymentId: PaymentId }) },
  responses: {
    200: json(Payment, "The payment"),
    401: unauthorized,
    403: forbidden,
    404: paymentNotFound,
    422: unprocessable,
  },
  summary: "Get a payment",
  tags: [ATTENDEE_TAG],
});

export const refundPaymentRoute = createRoute({
  description:
    "Full refunds only (§10). Refunding voids the registration's tickets and returns its seats, so it is the organiser's call, never the attendee's.",
  method: "post",
  path: "/organiser/payments/{paymentId}/refund",
  request: {
    body: jsonBody(RefundInput),
    params: params({ paymentId: PaymentId }),
  },
  responses: {
    200: json(Payment, "The refunded payment"),
    401: unauthorized,
    402: bkashRejected,
    403: forbidden,
    404: paymentNotFound,
    409: json(ErrorBody, "Payment is not refundable"),
    422: unprocessable,
    502: bkashUnavailable,
  },
  summary: "Refund a payment",
  tags: [ORGANISER_TAG],
});
