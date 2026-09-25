import { describe, expect, it } from "bun:test";
import type { Profile } from "@gc/domain/Domain/Profile";
import { z } from "zod";
import { makeApiClient, makeEndpoint } from "./client";
import {
  ApiError,
  hasTag,
  NETWORK_ERROR_TAG,
  UNEXPECTED_ERROR_TAG,
} from "./errors";
import { makeQueryApi } from "./query";
import { invalidationKeys, queryKeys } from "./query-keys";

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

// §7 case 26 (docs/spec/phase-3.md §6.8).
describe("the phase-3 profile endpoints", () => {
  const PROFILE = {
    companyDescription: null,
    companyName: null,
    createdAt: 1_690_000_000_000,
    email: "rita@example.test",
    emailVerified: true,
    id: "usr_1" as Profile["id"],
    jobTitle: null,
    linkedinUsername: null,
    name: "Rita",
    onboardedAt: null,
    userType: null,
  } satisfies Profile;

  it("sends PATCH /me with a JSON body and hands back the decoded profile", async () => {
    const patched = { ...PROFILE, jobTitle: "Designer" };
    const { calls, stub } = recording(jsonResponse(patched));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const result = await client.updateMe({ body: { jobTitle: "Designer" } });

    const call = only(calls);
    expect(call.url).toBe(`${BASE_URL}/me`);
    expect(call.init.method).toBe("PATCH");
    expect(headerOf(call, "content-type")).toBe("application/json");
    expect(JSON.parse(String(call.init.body))).toEqual({
      jobTitle: "Designer",
    });
    expect(result).toEqual(patched);
  });

  it("sends POST /me/onboarding with no body", async () => {
    const onboarded = { ...PROFILE, onboardedAt: 1_700_000_000_000 };
    const { calls, stub } = recording(jsonResponse(onboarded));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const result = await client.completeOnboarding();

    const call = only(calls);
    expect(call.url).toBe(`${BASE_URL}/me/onboarding`);
    expect(call.init.method).toBe("POST");
    expect(call.init.body ?? null).toBeNull();
    expect(result).toEqual(onboarded);
  });
});

// §7 case 28 (docs/spec/phase-4.md §6.5).
describe("the phase-4 notes endpoints", () => {
  const ID = "not_0000000000000001";
  const AT = 1_700_000_000_000;
  const NOTE = {
    attendees: [
      {
        email: "rita@example.test",
        id: "att_0000000000000001",
        isMe: true,
        name: "Rita",
      },
    ],
    bodyMarkdown: "### Updates",
    createdAt: AT,
    id: ID,
    source: "phone",
    startedAt: AT,
    title: "Weekly standup",
    trashedAt: null,
    updatedAt: AT,
  };
  const PAGE = {
    items: [
      {
        attendeeCount: 1,
        id: ID,
        source: "phone",
        startedAt: AT,
        title: "Weekly standup",
      },
    ],
    nextCursor: "WzE3MDAwMDAwMDAwMDAsIm5vdF8xIl0",
  };

  it("sends GET /notes with cursor and limit as query strings, and hands back the page", async () => {
    const { calls, stub } = recording(jsonResponse(PAGE));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const result = await client.listNotes({
      query: { cursor: "abc", limit: 5 },
    });

    const url = new URL(only(calls).url);
    expect(url.pathname).toBe("/notes");
    expect(url.searchParams.get("cursor")).toBe("abc");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(only(calls).init.method).toBe("GET");
    expect<unknown>(result).toEqual(PAGE);
  });

  it("sends POST /notes/{id}/trash with no body", async () => {
    const trashed = { ...NOTE, trashedAt: AT };
    const { calls, stub } = recording(jsonResponse(trashed));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const result = await client.trashNote({ params: { id: ID } });

    const call = only(calls);
    expect(call.url).toBe(`${BASE_URL}/notes/${ID}/trash`);
    expect(call.init.method).toBe("POST");
    expect(call.init.body ?? null).toBeNull();
    expect<unknown>(result).toEqual(trashed);
  });

  it("sends POST /notes/{id}/restore with no body", async () => {
    const { calls, stub } = recording(jsonResponse(NOTE));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const result = await client.restoreNote({ params: { id: ID } });

    expect(only(calls).url).toBe(`${BASE_URL}/notes/${ID}/restore`);
    expect(only(calls).init.method).toBe("POST");
    expect<unknown>(result).toEqual(NOTE);
  });

  it("reads one note at GET /notes/{id}", async () => {
    const { calls, stub } = recording(jsonResponse(NOTE));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const result = await client.getNote({ params: { id: ID } });

    expect(only(calls).url).toBe(`${BASE_URL}/notes/${ID}`);
    expect(only(calls).init.method).toBe("GET");
    expect<unknown>(result).toEqual(NOTE);
  });

  it("sends PATCH /notes/{id} with only the keys given", async () => {
    const { calls, stub } = recording(jsonResponse(NOTE));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    await client.updateNote({ body: { title: "New" }, params: { id: ID } });

    const call = only(calls);
    expect(call.url).toBe(`${BASE_URL}/notes/${ID}`);
    expect(call.init.method).toBe("PATCH");
    expect(JSON.parse(String(call.init.body))).toEqual({ title: "New" });
  });

  it("sends POST /notes with a JSON body and hands back the 201", async () => {
    const { calls, stub } = recording(jsonResponse(NOTE, 201));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const result = await client.createNote({
      body: { title: "Weekly standup" },
    });

    expect(only(calls).url).toBe(`${BASE_URL}/notes`);
    expect(only(calls).init.method).toBe("POST");
    expect<unknown>(result).toEqual(NOTE);
  });
});

describe("the phase-4 notes query keys", () => {
  const ID = "not_0000000000000001";

  it("nests list and detail under one notes prefix", () => {
    const notes = queryKeys.notes;

    expect(notes.all).toEqual(["notes"]);
    expect(notes.list()).toEqual(["notes", "list"]);
    expect(notes.detail(ID)).toEqual(["notes", "detail", ID]);
  });

  it("invalidates the detail and the list on every write to one note, and the list on create", () => {
    const keys = invalidationKeys as unknown as Record<
      string,
      ((id?: string) => readonly unknown[]) | undefined
    >;
    const both = [
      ["notes", "detail", ID],
      ["notes", "list"],
    ];

    // Phase 8: search results and person pages are built from the same notes.
    const withSearch = [...both, ["search"], ["people"]];

    expect(keys.updateNote?.(ID)).toEqual(withSearch);
    expect(keys.trashNote?.(ID)).toEqual(withSearch);
    expect(keys.restoreNote?.(ID)).toEqual(withSearch);
    expect(keys.retryNoteGeneration?.(ID)).toEqual(both);
    expect(keys.updateMe?.()).toEqual([
      ["me", "profile"],
      ["people"],
      ["search"],
    ]);
    expect(keys.createNote?.()).toEqual([["notes", "list"]]);
  });
});

describe("the phase-8 search and people endpoints", () => {
  const RESULTS = { notes: [], people: [], query: "standup" };
  const PERSON = {
    domain: "example.com",
    email: "priya@example.com",
    isMe: false,
    key: "email:priya@example.com",
    name: "Priya Raman",
  };

  it("sends GET /search with q as a query string", async () => {
    const { calls, stub } = recording(jsonResponse(RESULTS));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    const result = await client.search({ query: { q: "standup" } });

    const url = new URL(only(calls).url);
    expect(url.pathname).toBe("/search");
    expect(url.searchParams.get("q")).toBe("standup");
    expect<unknown>(result).toEqual(RESULTS);
  });

  it("URL-encodes the person key into GET /people/{personKey}", async () => {
    const { calls, stub } = recording(jsonResponse(PERSON));
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    await client.getPerson({
      params: { personKey: "email:priya@example.com" },
    });

    expect(only(calls).url).toBe(
      `${BASE_URL}/people/email%3Apriya%40example.com`
    );
  });

  it("sends the person filter on GET /notes", async () => {
    const { calls, stub } = recording(
      jsonResponse({ items: [], nextCursor: null })
    );
    const client = makeApiClient({ baseUrl: BASE_URL, fetch: stub });

    await client.listNotes({
      query: { cursor: null, limit: 20, person: "name:dana lee" },
    });

    const url = new URL(only(calls).url);
    expect(url.searchParams.get("person")).toBe("name:dana lee");
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  it("keys a person's notes apart from home's list, under the same prefix", () => {
    const person = queryKeys.notes.list({ person: "email:priya@example.com" });

    expect(person).toEqual([
      "notes",
      "list",
      { person: "email:priya@example.com" },
    ]);
    expect<unknown>(person.slice(0, 2)).toEqual(queryKeys.notes.list());
    expect(queryKeys.people.detail("name:dana lee")).toEqual([
      "people",
      "detail",
      "name:dana lee",
    ]);
    expect(queryKeys.search.results("ra")).toEqual(["search", "ra"]);
  });
});

describe("the infinite-query helper (phase 4)", () => {
  it("returns plain options useInfiniteQuery accepts, paging on nextCursor from null", async () => {
    const client = makeApiClient({
      baseUrl: BASE_URL,
      fetch: recording().stub,
    });
    const seen: unknown[] = [];

    const options = makeQueryApi(client).infinite(
      ["notes", "list"],
      (cursor: string | null) => {
        seen.push(cursor);
        return Promise.resolve({ items: [], nextCursor: "next" });
      }
    );

    expect(options.queryKey).toEqual(["notes", "list"]);
    expect(options.initialPageParam).toBeNull();
    expect(options.getNextPageParam({ items: [], nextCursor: "c2" })).toBe(
      "c2"
    );
    expect(
      options.getNextPageParam({ items: [], nextCursor: null })
    ).toBeNull();
    await options.queryFn({ pageParam: "c1" });
    expect(seen).toEqual(["c1"]);
  });
});
