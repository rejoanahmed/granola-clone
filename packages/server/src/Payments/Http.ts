import { BkashWebhookBody, type WebhookAck } from "@evb/domain/Domain/Payment";
import { Unauthorized } from "@evb/domain/Errors";
import {
  bkashCallbackRoute,
  bkashWebhookRoute,
  createCheckoutRoute,
  getPaymentRoute,
  refundPaymentRoute,
} from "@evb/domain/Payment/Contract";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";
import type { Container } from "../container";

const FOUND = 302;
const CREATED = 201;

// Passed explicitly on every `c.json`: `.openapi()` types the handler against every declared
// response, and only the status narrows the union to the success body.
const OK = 200;

// Structural rather than `Context<AppEnv>` so it accepts the narrower context `.openapi()` hands a
// typed handler.
const actorOf = (c: { var: { actor: Actor | null } }): Actor => {
  const { actor } = c.var;
  // `== null`, not `=== null`: a Hono variable middleware never set reads back `undefined`.
  if (actor == null) {
    throw new Unauthorized();
  }
  return actor;
};

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// Reads the raw body itself, and the route must declare no `request.body`: a body validator calls
// `c.req.json()` first, after which `c.req.text()` returns re-serialised bytes and every HMAC
// fails. Unparseable bodies go through as `null` so the signature is still checked (401, not 200).
const acknowledgeWebhook = async (c: {
  req: {
    header: (name: string) => string | undefined;
    text: () => Promise<string>;
  };
  var: { svc: Container };
}): Promise<WebhookAck> => {
  const rawBody = await c.req.text();
  const parsed = BkashWebhookBody.safeParse(parseJson(rawBody));
  return await c.var.svc.payments.handleWebhook(
    parsed.success ? parsed.data : null,
    rawBody,
    c.req.header("x-bkash-signature") ?? null
  );
};

export const paymentsRouter = new OpenAPIHono<AppEnv>()
  .openapi(createCheckoutRoute, async (c) =>
    c.json(
      await c.var.svc.payments.createCheckout(
        actorOf(c),
        c.req.valid("param").registrationId
      ),
      CREATED
    )
  )

  .openapi(bkashCallbackRoute, async (c) =>
    c.redirect(
      c.var.svc.payments.returnUrl(
        await c.var.svc.payments.handleCallback(c.req.valid("query"))
      ),
      FOUND
    )
  )

  // 200 for every outcome but a bad signature: a 5xx on our own bug makes bKash retry forever.
  .openapi(bkashWebhookRoute, async (c) =>
    c.json(await acknowledgeWebhook(c), OK)
  )

  .openapi(getPaymentRoute, async (c) =>
    c.json(
      await c.var.svc.payments.byId(c.req.valid("param").paymentId, actorOf(c)),
      OK
    )
  )

  .openapi(refundPaymentRoute, async (c) =>
    c.json(
      await c.var.svc.payments.refund(
        c.req.valid("param").paymentId,
        actorOf(c),
        c.req.valid("json")
      ),
      OK
    )
  );
