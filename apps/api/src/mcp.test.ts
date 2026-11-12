import type { Env } from "@kn/server";
import { makeTestD1 } from "@kn/server/Testing";
import { describe, expect, it } from "vitest";
import { app } from "./app";

// D038, end to end over the real app: `/mcp` does not exist until MCP_TOKEN arms it, refuses any
// other bearer (the pairing token included), speaks both protocol eras without a session, and
// reads the paired owner's notes while offering no tool that writes.

const API = "http://localhost:3001";
const OWNER_TOKEN = "owner-token-for-the-mcp-test-00001";
const MCP_TOKEN = "mcp-token-for-the-mcp-test-0000001";

const unarmed = {
  API_URL: API,
  AUTH_MODE: "owner",
  BETTER_AUTH_SECRET: "a-better-auth-secret-of-sufficient-length",
  BETTER_AUTH_URL: API,
  CALENDAR_MODE: "off",
  DB: makeTestD1(),
  EMAIL_MODE: "off",
  NODE_ENV: "development",
  OWNER_EMAIL: "me@example.test",
  OWNER_TOKEN,
} satisfies Env;

const armed = { ...unarmed, DB: makeTestD1(), MCP_TOKEN } satisfies Env;

const LEGACY = "2025-06-18";

const rpc = (
  method: string,
  params: Record<string, unknown>,
  token: string | null = MCP_TOKEN,
  env: Env = armed
) =>
  app.request(
    "/mcp",
    {
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "mcp-protocol-version": LEGACY,
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      },
      method: "POST",
    },
    env
  );

// The SDK frames an answer either as JSON or as a one-message event stream, by era and by the
// client's `accept`; either is the same JSON-RPC message.
const message = async <T>(response: Response): Promise<T> => {
  const body = await response.text();
  const data = body.split("\n").find((line) => line.startsWith("data:"));
  return JSON.parse(data === undefined ? body : data.slice(5)) as T;
};

type ToolResult = {
  result: { content: { text: string }[]; isError?: boolean };
};

const call = async (name: string, args: Record<string, unknown>) => {
  const response = await rpc("tools/call", { arguments: args, name });
  const { result } = await message<ToolResult>(response);
  return {
    isError: result.isError === true,
    status: response.status,
    text: result.content[0]?.text ?? "",
  };
};

describe("the MCP endpoint", () => {
  it("does not exist on a server without MCP_TOKEN", async () => {
    const response = await rpc("tools/list", {}, MCP_TOKEN, unarmed);

    expect(response.status).toBe(404);
  });

  it("answers 401 with a Bearer challenge for no token, a wrong one, and the pairing token", async () => {
    for (const token of [null, "not-the-mcp-token-at-all-nope", OWNER_TOKEN]) {
      const response = await rpc("tools/list", {}, token);

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
    }
  });

  it("answers a legacy client's initialize without a session", async () => {
    const response = await rpc("initialize", {
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
      protocolVersion: LEGACY,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
    await expect(message(response)).resolves.toMatchObject({
      result: { serverInfo: { name: "kothanote" } },
    });
  });

  it("lists four tools, every one of them read-only", async () => {
    const response = await rpc("tools/list", {});
    const { result } = await message<{
      result: {
        tools: { annotations?: { readOnlyHint?: boolean }; name: string }[];
      };
    }>(response);

    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      "get_note",
      "get_transcript",
      "list_notes",
      "search_notes",
    ]);
    expect(result.tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
  });

  it("reads the note the paired owner wrote, and finds it by search", async () => {
    const paired = await app.request(
      "/owner/session",
      {
        body: JSON.stringify({ token: OWNER_TOKEN }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
      armed
    );
    const { cookie } = (await paired.json()) as {
      cookie: { name: string; value: string };
    };
    const created = await app.request(
      "/notes",
      {
        body: JSON.stringify({ title: "Quarterly planning" }),
        headers: {
          "content-type": "application/json",
          cookie: `${cookie.name}=${cookie.value}`,
        },
        method: "POST",
      },
      armed
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const listed = await call("list_notes", {});
    expect(listed).toMatchObject({ isError: false, status: 200 });
    expect(listed.text).toContain(id);

    const read = await call("get_note", { id });
    expect(read.text).toContain("Quarterly planning");

    const found = await call("search_notes", { query: "quarterly" });
    expect(found.text).toContain(id);

    // Typed by hand: there is no recording, so the tool says so instead of failing the protocol.
    const transcript = await call("get_transcript", { id });
    expect(transcript).toMatchObject({ isError: true });
    expect(transcript.text).toContain("TranscriptNotFound");
  });

  it("answers an unknown note as a tool error, not a protocol error", async () => {
    const missing = await call("get_note", { id: "not_a_note" });

    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("NoteNotFound");
  });
});
