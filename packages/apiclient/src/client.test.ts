import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { makeApiClient, makeEndpoint } from "./client";
import {
  ApiError,
  hasTag,
  NETWORK_ERROR_TAG,
  UNEXPECTED_ERROR_TAG,
} from "./errors";

const BASE_URL = "https://api.test";
const NOTE_ID = "note_0123456789abcdef";

// Route shapes written out here rather than imported: the only real contract today is `GET /me`,
// which has no params, query or body, and the client's job is exactly those. These are typed the
// way `createRoute` types a route, so `endpoint<typeof …>` checks them as it would a real one.
const success = <S extends z.ZodType>(schema: S) => ({
  content: { "application/json": { schema } },
  description: "ok",
});

const Note = z.object({ id: z.string(), title: z.string() });

const getNoteRoute = {
  method: "get",
  path: "/notes/{noteId}",
  request: { params: z.object({ noteId: z.string() }) },
  responses: { 200: success(Note) },
} as const;

const listNotesRoute = {
  method: "get",
  path: "/notes",
  request: {
    query: z.object({
      cursor: z.string().nullable().default(null),
      limit: z.coerce.number().default(20),
      q: z.string().optional(),
    }),
  },
  responses: { 200: success(z.object({ items: z.array(Note) })) },
} as const;

const createNoteRoute = {
  method: "post",
  path: "/notes",
  request: {
    body: {
      content: {
        "application/json": { schema: z.object({ title: z.string() }) },
      },
    },
  },
  responses: { 201: success(Note) },
} as const;

const signedHookRoute = {
  method: "post",
  path: "/hooks/provider",
  request: { headers: z.object({ "x-signature": z.string() }) },
  responses: { 200: success(z.object({ outcome: z.string() })) },
} as const;

const redirectRoute = {
  method: "get",
  path: "/oauth/return",
  responses: { 302: { description: "Back into the app" } },
} as const;

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

describe("makeEndpoint", () => {
  it("interpolates path params and leaves the response untouched", async () => {
    const note = { id: NOTE_ID, title: "Standup" };
    const { calls, stub } = recording(jsonResponse(note));
    const getNote = makeEndpoint({ baseUrl: BASE_URL, fetch: stub })<
      typeof getNoteRoute
    >("get", "/notes/{noteId}");

    const result = await getNote({ params: { noteId: NOTE_ID } });

    expect(only(calls).url).toBe(`${BASE_URL}/notes/${NOTE_ID}`);
    expect(only(calls).init.method).toBe("GET");
    // The client does not re-parse what it is given: the type comes from the contract, the bytes
    // are trusted.
    expect(result).toEqual(note);
  });

  it("serialises query params and omits nulls", async () => {
    const { calls, stub } = recording();
    const listNotes = makeEndpoint({ baseUrl: BASE_URL, fetch: stub })<
      typeof listNotesRoute
    >("get", "/notes");

    await listNotes({ query: { cursor: null, limit: 5, q: "standup" } });

    const url = new URL(only(calls).url);
    expect(url.pathname).toBe("/notes");
    expect(url.searchParams.get("q")).toBe("standup");
    expect(url.searchParams.get("limit")).toBe("5");
    // Sending the string "null" would fail a `min(1)` cursor check as a value — a 422 nobody can
    // explain.
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  it("requires no argument when every filter has a default", async () => {
    const { calls, stub } = recording();
    const listNotes = makeEndpoint({ baseUrl: BASE_URL, fetch: stub })<
      typeof listNotesRoute
    >("get", "/notes");

    await listNotes();

    expect(only(calls).url).toBe(`${BASE_URL}/notes`);
  });

  it("sends a JSON body and returns the 201", async () => {
    const created = { id: NOTE_ID, title: "Standup" };
    const { calls, stub } = recording(jsonResponse(created, 201));
    const createNote = makeEndpoint({ baseUrl: BASE_URL, fetch: stub })<
      typeof createNoteRoute
    >("post", "/notes");

    const result = await createNote({ body: { title: "Standup" } });

    const call = only(calls);
    expect(call.init.method).toBe("POST");
    expect(headerOf(call, "content-type")).toBe("application/json");
    expect(JSON.parse(String(call.init.body))).toEqual({ title: "Standup" });
    expect(result).toEqual(created);
  });

  it("sends raw bytes untouched so a signature over them still verifies", async () => {
    const raw = '{"id":"evt_1","status":"done"}';
    const { calls, stub } = recording(jsonResponse({ outcome: "applied" }));
    const hook = makeEndpoint({ baseUrl: BASE_URL, fetch: stub })<
      typeof signedHookRoute
    >("post", "/hooks/provider");

    const ack = await hook(
      { headers: { "x-signature": "deadbeef" } },
      { body: raw }
    );

    const call = only(calls);
    expect(call.init.body).toBe(raw);
    expect(headerOf(call, "x-signature")).toBe("deadbeef");
    // No content-type: the bytes pass through untouched, because re-serialising breaks the HMAC.
    expect(headerOf(call, "content-type")).toBeNull();
    expect(ack).toEqual({ outcome: "applied" });
  });

  it("returns the raw Response for a redirect route and follows no redirect", async () => {
    const redirect = Response.redirect("gcnotes://signed-in", 302);
    const { calls, stub } = recording(redirect);
    const back = makeEndpoint({ baseUrl: BASE_URL, fetch: stub })<
      typeof redirectRoute
    >("get", "/oauth/return", { raw: true });

    const response = await back();

    expect(only(calls).init.redirect).toBe("manual");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("gcnotes://signed-in");
  });

  it("forwards an AbortSignal so a dropped screen cancels its request", async () => {
    const controller = new AbortController();
    const { calls, stub } = recording();
    const getNote = makeEndpoint({ baseUrl: BASE_URL, fetch: stub })<
      typeof getNoteRoute
    >("get", "/notes/{noteId}");

    await getNote(
      { params: { noteId: NOTE_ID } },
      { signal: controller.signal }
    );

    expect(only(calls).init.signal).toBe(controller.signal);
  });
});

describe("makeApiClient", () => {
  it("reaches GET /me, the one route the contract has", async () => {
    const { calls, stub } = recording(jsonResponse({ id: "usr_1" }));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    await client.getMe();

    expect(only(calls).url).toBe(`${BASE_URL}/me`);
    expect(only(calls).init.method).toBe("GET");
  });

  it("defaults credentials to include and stamps the expo origin only when given one", async () => {
    const { calls, stub } = recording();
    const plain = makeApiClient({ baseUrl: BASE_URL, fetch: stub });
    await plain.getMe();
    expect(only(calls).init.credentials).toBe("include");
    expect(headerOf(only(calls), "expo-origin")).toBeNull();

    const native = recording();
    const app = makeApiClient({
      baseUrl: BASE_URL,
      credentials: "omit",
      expoOrigin: () => "gcnotes://",
      fetch: native.stub,
    });
    await app.getMe();
    expect(only(native.calls).init.credentials).toBe("omit");
    expect(headerOf(only(native.calls), "expo-origin")).toBe("gcnotes://");
  });

  it("trims a trailing slash off the base URL", async () => {
    const { calls, stub } = recording();
    const client = makeApiClient({ baseUrl: `${BASE_URL}/`, fetch: stub });

    await client.getMe();

    expect(only(calls).url).toBe(`${BASE_URL}/me`);
  });

  it("turns an ErrorBody into an ApiError that hasTag narrows", async () => {
    const { stub } = recording(
      jsonResponse(
        {
          _tag: "ProfileNotFound",
          details: { id: "usr_1" },
          message: "ProfileNotFound",
        },
        404
      )
    );
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const error = await caught(() => client.getMe());

    expect(error).toBeInstanceOf(ApiError);
    expect(hasTag(error, "ProfileNotFound")).toBe(true);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).details).toEqual({ id: "usr_1" });
  });

  it("tags a failure that is not an ErrorBody as UnexpectedError", async () => {
    const { stub } = recording(
      new Response("<html>502 Bad Gateway</html>", { status: 502 })
    );
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const error = await caught(() => client.getMe());

    expect(hasTag(error, UNEXPECTED_ERROR_TAG)).toBe(true);
    expect((error as ApiError).status).toBe(502);
  });

  it("tags a transport failure as NetworkError with status 0", async () => {
    const stub = asFetch(() =>
      Promise.reject(new TypeError("Network request failed"))
    );
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const error = await caught(() => client.getMe());

    expect(hasTag(error, NETWORK_ERROR_TAG)).toBe(true);
    expect((error as ApiError).status).toBe(0);
  });
});
