import { describe, expect, it } from "vitest";
import {
  ConnectError,
  connectParamsOf,
  normalizeServerUrl,
  pairWithOwnerToken,
  readServerInfo,
} from "./connect";

// docs/spec/phase-13.md §3.1–§3.3: the first-run connect step's rules.

const strict = { allowInsecureLocal: false };
const dev = { allowInsecureLocal: true };

const INFO = {
  auth: "owner",
  email: false,
  llm: "workers-ai",
  service: "kothanote",
  transcription: "workers-ai",
  transcriptionLanguage: "auto",
  version: 1,
};

const answering = (status: number, body: unknown) => (): Promise<Response> =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const failure = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error instanceof ConnectError ? error.failure : String(error);
  }
  return "resolved";
};

describe("normalizeServerUrl", () => {
  it("adds https:// and strips a path, a query and a trailing slash", () => {
    expect(
      normalizeServerUrl(" my-server.acct.workers.dev/server/ ", strict)
    ).toBe("https://my-server.acct.workers.dev");
    expect(normalizeServerUrl("https://notes.example.com/?x=1", strict)).toBe(
      "https://notes.example.com"
    );
  });

  it("refuses plain http, except a local address in a development build", () => {
    expect(normalizeServerUrl("http://notes.example.com", strict)).toBeNull();
    expect(normalizeServerUrl("http://192.168.1.20:3001", strict)).toBeNull();
    expect(normalizeServerUrl("http://192.168.1.20:3001", dev)).toBe(
      "http://192.168.1.20:3001"
    );
    expect(normalizeServerUrl("http://localhost:3002", dev)).toBe(
      "http://localhost:3002"
    );
  });

  it("refuses what is not an address at all", () => {
    expect(normalizeServerUrl("", strict)).toBeNull();
    expect(normalizeServerUrl("hello", strict)).toBeNull();
    expect(normalizeServerUrl("ftp://notes.example.com", strict)).toBeNull();
  });
});

describe("connectParamsOf", () => {
  it("reads the server and token from the setup link, first value wins", () => {
    expect(
      connectParamsOf({ server: ["https://a.dev", "x"], token: " t " })
    ).toEqual({
      server: "https://a.dev",
      token: "t",
    });
    expect(connectParamsOf({})).toEqual({ server: "", token: "" });
  });
});

describe("readServerInfo", () => {
  it("accepts this product's server", async () => {
    await expect(
      readServerInfo(answering(200, INFO), "https://a.dev")
    ).resolves.toEqual(INFO);
  });

  it("refuses another service, a malformed answer, an error and an old version", async () => {
    expect(
      await failure(() =>
        readServerInfo(
          answering(200, { ...INFO, service: "x" }),
          "https://a.dev"
        )
      )
    ).toBe("not-a-server");
    expect(
      await failure(() =>
        readServerInfo(answering(200, { ok: true }), "https://a.dev")
      )
    ).toBe("not-a-server");
    expect(
      await failure(() => readServerInfo(answering(404, {}), "https://a.dev"))
    ).toBe("not-a-server");
    expect(
      await failure(() =>
        readServerInfo(answering(200, { ...INFO, version: 0 }), "https://a.dev")
      )
    ).toBe("not-a-server");
  });

  it("reads a network failure as unreachable", async () => {
    expect(
      await failure(() =>
        readServerInfo(
          () => Promise.reject(new Error("offline")),
          "https://a.dev"
        )
      )
    ).toBe("unreachable");
  });
});

describe("pairWithOwnerToken", () => {
  it("posts the trimmed token and answers the Set-Cookie string", async () => {
    const seen: { body: unknown; url: string }[] = [];
    const cookie = await pairWithOwnerToken(
      (url, init) => {
        seen.push({ body: JSON.parse(String(init?.body)), url });
        return Promise.resolve(
          Response.json({
            cookie: { name: "n", value: "v" },
            expiresAt: 1,
            setCookie: "n=v; Path=/",
          })
        );
      },
      "https://a.dev",
      "  secret-token  "
    );

    expect(cookie).toBe("n=v; Path=/");
    expect(seen).toEqual([
      { body: { token: "secret-token" }, url: "https://a.dev/owner/session" },
    ]);
  });

  it("names a wrong token, a rate limit and anything else apart", async () => {
    expect(
      await failure(() =>
        pairWithOwnerToken(answering(401, {}), "https://a.dev", "t")
      )
    ).toBe("wrong-token");
    expect(
      await failure(() =>
        pairWithOwnerToken(answering(429, {}), "https://a.dev", "t")
      )
    ).toBe("rate-limited");
    expect(
      await failure(() =>
        pairWithOwnerToken(answering(500, {}), "https://a.dev", "t")
      )
    ).toBe("pairing-failed");
  });
});
