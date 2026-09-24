import { describe, expect, it } from "bun:test";
import { makeApiClient } from "./client";
import {
  ApiError,
  hasTag,
  NETWORK_ERROR_TAG,
  UNEXPECTED_ERROR_TAG,
} from "./errors";

const BASE_URL = "https://api.test";
const EVENT_ID = "evt_0123456789abcdef";
const REGISTRATION_ID = "reg_0123456789abcdef";
const PAYMENT_ID = "pay_0123456789abcdef";

type Recorded = { readonly init: RequestInit; readonly url: string };

/**
 * `bun-types` (loaded here for `bun:test`, by no app) puts `preconnect` on the global, so a bare
 * arrow is not assignable to `ApiClientConfig["fetch"]`. `Object.assign` supplies it; it is unused.
 */
const asFetch = (
  run: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
) => Object.assign(run, { preconnect: () => undefined });

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });

/** Answers `responses` in order; an exhausted queue answers an empty 200. */
const recording = (...responses: readonly Response[]) => {
  const calls: Recorded[] = [];
  let index = 0;
  const stub = asFetch((input, init) => {
    calls.push({ init: init ?? {}, url: String(input) });
    const response = responses[index] ?? jsonResponse({});
    index += 1;
    return Promise.resolve(response);
  });
  return { calls, stub };
};

const only = (calls: readonly Recorded[]): Recorded => {
  const call = calls[0];
  if (call === undefined) {
    throw new Error("expected exactly one request, got none");
  }
  return call;
};

const headerOf = (call: Recorded, name: string): string | null =>
  new Headers(call.init.headers).get(name);

const caught = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to reject");
};

describe("makeApiClient", () => {
  it("interpolates path params and leaves the response untouched", async () => {
    const detail = { id: EVENT_ID, status: "published", title: "Folk Fest" };
    const { calls, stub } = recording(jsonResponse(detail));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const result = await client.getEvent({ params: { eventId: EVENT_ID } });

    expect(only(calls).url).toBe(`${BASE_URL}/events/${EVENT_ID}`);
    expect(only(calls).init.method).toBe("GET");
    // The client does not re-parse what it is given: the type comes from the contract, the bytes are
    // trusted. Hence the widening — `result` is typed `EventDetail`, the stub answered three fields.
    expect(result as unknown).toEqual(detail);
  });

  it("serialises query params and omits nulls", async () => {
    const { calls, stub } = recording();
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    await client.listEvents({
      query: { city: "Dhaka", cursor: null, from: 0, limit: 5 },
    });

    const url = new URL(only(calls).url);
    expect(url.pathname).toBe("/events");
    expect(url.searchParams.get("city")).toBe("Dhaka");
    expect(url.searchParams.get("limit")).toBe("5");
    // Sending the string "null" would fail `Cursor`'s min(1) check as a value — a 422 nobody can
    // explain.
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  it("requires no argument when every filter has a default", async () => {
    const { calls, stub } = recording();
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    await client.listEvents();

    expect(only(calls).url).toBe(`${BASE_URL}/events`);
  });

  it("sends a JSON body and returns the 201", async () => {
    const created = { id: REGISTRATION_ID, status: "pending" };
    const { calls, stub } = recording(jsonResponse(created, 201));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const result = await client.register({
      body: {
        attendeeName: "Nusrat Rahman",
        attendeePhone: "8801712345678",
        lines: [{ quantity: 2, ticketTypeId: "tty_0123456789abcdef" }],
      },
      params: { eventId: EVENT_ID },
    });

    const call = only(calls);
    expect(call.url).toBe(`${BASE_URL}/events/${EVENT_ID}/registrations`);
    expect(call.init.method).toBe("POST");
    expect(headerOf(call, "content-type")).toBe("application/json");
    expect(JSON.parse(String(call.init.body))).toEqual({
      attendeeName: "Nusrat Rahman",
      attendeePhone: "8801712345678",
      lines: [{ quantity: 2, ticketTypeId: "tty_0123456789abcdef" }],
    });
    // Widened as above: the claim is that the bytes arrived unchanged.
    expect(result as unknown).toEqual(created);
  });

  it("defaults credentials to include and stamps the expo origin", async () => {
    const { calls, stub } = recording();
    const web = makeApiClient({ baseUrl: BASE_URL, fetch: stub });
    await web.listMyRegistrations();
    expect(only(calls).init.credentials).toBe("include");
    expect(headerOf(only(calls), "expo-origin")).toBeNull();

    const native = recording();
    const app = makeApiClient({
      baseUrl: BASE_URL,
      credentials: "omit",
      expoOrigin: () => "gcnotes://",
      fetch: native.stub,
    });
    await app.listMyRegistrations();
    expect(only(native.calls).init.credentials).toBe("omit");
    expect(headerOf(only(native.calls), "expo-origin")).toBe("gcnotes://");
  });

  it("trims a trailing slash off the base URL", async () => {
    const { calls, stub } = recording();
    const client = makeApiClient({ baseUrl: `${BASE_URL}/`, fetch: stub });

    await client.getPayment({ params: { paymentId: PAYMENT_ID } });

    expect(only(calls).url).toBe(`${BASE_URL}/payments/${PAYMENT_ID}`);
  });

  it("turns an ErrorBody into an ApiError that hasTag narrows", async () => {
    const { stub } = recording(
      jsonResponse(
        {
          _tag: "SoldOut",
          details: { ticketTypeIds: ["tty_0123456789abcdef"] },
          message: "SoldOut",
        },
        409
      )
    );
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const error = await caught(() =>
      client.register({
        body: {
          attendeeName: "Nusrat Rahman",
          attendeePhone: "8801712345678",
          lines: [{ quantity: 2, ticketTypeId: "tty_0123456789abcdef" }],
        },
        params: { eventId: EVENT_ID },
      })
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(hasTag(error, "SoldOut")).toBe(true);
    expect((error as ApiError).status).toBe(409);
    // The structured details are what let the picker grey out the rows that ran out.
    expect((error as ApiError).details).toEqual({
      ticketTypeIds: ["tty_0123456789abcdef"],
    });
  });

  it("tags a failure that is not an ErrorBody as UnexpectedError", async () => {
    const { stub } = recording(
      new Response("<html>502 Bad Gateway</html>", { status: 502 })
    );
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const error = await caught(() =>
      client.getEvent({ params: { eventId: EVENT_ID } })
    );

    expect(hasTag(error, UNEXPECTED_ERROR_TAG)).toBe(true);
    expect((error as ApiError).status).toBe(502);
  });

  it("tags a transport failure as NetworkError with status 0", async () => {
    const stub = asFetch(() =>
      Promise.reject(new TypeError("Network request failed"))
    );
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const error = await caught(() =>
      client.getEvent({ params: { eventId: EVENT_ID } })
    );

    expect(hasTag(error, NETWORK_ERROR_TAG)).toBe(true);
    expect((error as ApiError).status).toBe(0);
  });

  it("returns the raw Response for the bKash callback and follows no redirect", async () => {
    const redirect = Response.redirect(
      "https://app.test/payment/return?outcome=succeeded",
      302
    );
    const { calls, stub } = recording(redirect);
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const response = await client.bkashCallback({
      query: { paymentID: "TR0011", status: "success" },
    });

    expect(only(calls).init.redirect).toBe("manual");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/payment/return");
  });

  it("sends the webhook's raw bytes so the signature covers them", async () => {
    const raw = '{"paymentID":"TR0011","transactionStatus":"Completed"}';
    const { calls, stub } = recording(jsonResponse({ outcome: "applied" }));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const ack = await client.bkashWebhook(
      { headers: { "x-bkash-signature": "deadbeef" } },
      { body: raw }
    );

    const call = only(calls);
    expect(call.init.body).toBe(raw);
    expect(headerOf(call, "x-bkash-signature")).toBe("deadbeef");
    // No content-type: the bytes pass through untouched, because re-serialising breaks the HMAC.
    expect(headerOf(call, "content-type")).toBeNull();
    expect(ack).toEqual({ outcome: "applied" });
  });

  it("forwards an AbortSignal so a dropped screen cancels its request", async () => {
    const controller = new AbortController();
    const { calls, stub } = recording();
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    await client.getPayment(
      { params: { paymentId: PAYMENT_ID } },
      { signal: controller.signal }
    );

    expect(only(calls).init.signal).toBe(controller.signal);
  });
});
