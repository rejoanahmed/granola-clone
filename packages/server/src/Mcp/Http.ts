import { createMcpHandler } from "@modelcontextprotocol/server";
import { Hono } from "hono";
import type { AppEnv } from "../AppEnv";
import { buildMcpServer } from "./Tools";

const BEARER = /^Bearer +(\S+)$/i;

const bearerOf = (header: string | undefined): string | null =>
  header === undefined ? null : (BEARER.exec(header.trim())?.[1] ?? null);

// D038. A plain `Hono` with no `Contract.ts`, as the E2E harness is: MCP is its own protocol, so it
// is not in the OpenAPI document and not in the generated client. The SDK's handler is stateless:
// a server per request and no session, and a stream only as long as the one answer it frames, so
// nothing here needs a Durable Object. It answers both protocol eras (clients that open with `initialize`, and those that do
// not), which is the reason this is the SDK and not two hundred lines of our own.
export const mcpRouter = new Hono<AppEnv>().all("/mcp", async (c) => {
  const mcp = c.var.svc.mcp;
  // 404 before the header is read, as the harness does: unarmed, the route does not exist.
  if (mcp === null) {
    return c.notFound();
  }
  const actor = await mcp.actorFor(bearerOf(c.req.header("authorization")));
  if (actor === null) {
    return c.json(
      { _tag: "Unauthorized", message: "MCP token rejected" },
      401,
      { "www-authenticate": 'Bearer realm="mcp"' }
    );
  }
  const svc = c.var.svc;
  return createMcpHandler(() => buildMcpServer(svc, actor)).fetch(c.req.raw);
});
