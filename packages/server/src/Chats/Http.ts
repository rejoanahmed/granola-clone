import {
  createChatRoute,
  deleteChatRoute,
  getChatRoute,
  listChatModelsRoute,
  listChatsRoute,
  patchChatRoute,
  putChatFeedbackRoute,
  putChatModelRoute,
  retryChatMessageRoute,
  sendChatMessageRoute,
} from "@gc/domain/Chats/Contract";
import type { ChatEvent } from "@gc/domain/Chats/Events";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv } from "../AppEnv";
import { requireActor } from "../Auth/Actor";
import { pipe } from "./Pipe";

// The service has answered before this runs, so anything that refuses the question has already
// been thrown as an ordinary JSON error; only the answer itself travels as SSE.
const sse = (c: Context<AppEnv>, events: AsyncIterable<ChatEvent>) =>
  streamSSE(c, (stream) => pipe(events, stream));

// Before the contract's validation, so an anonymous caller is told to sign in rather than that its
// body is malformed: a 422 would describe a request nobody was allowed to make.
const signedIn: MiddlewareHandler<AppEnv> = async (c, next) => {
  requireActor(c.var.actor);
  await next();
};

// Not chained: `use` is typed to return a plain `Hono`, which would erase `openapi` below.
const router = new OpenAPIHono<AppEnv>();
router.use("/chat/*", signedIn);
router.use("/chats", signedIn);
router.use("/chats/*", signedIn);

// One expression per route (R6). Every `c.json()` names its status literal, as the notes router
// does, or Hono infers the union of every declared code and the route stops compiling.
export const chatsRouter = router
  .openapi(listChatModelsRoute, async (c) =>
    c.json(await c.var.svc.chats.models(requireActor(c.var.actor)), 200)
  )
  .openapi(putChatModelRoute, async (c) =>
    c.json(
      await c.var.svc.chats.selectModel(
        requireActor(c.var.actor),
        c.req.valid("json").model
      ),
      200
    )
  )
  .openapi(createChatRoute, async (c) =>
    sse(
      c,
      await c.var.svc.chats.ask(requireActor(c.var.actor), c.req.valid("json"))
    )
  )
  .openapi(sendChatMessageRoute, async (c) =>
    sse(
      c,
      await c.var.svc.chats.ask(requireActor(c.var.actor), {
        content: c.req.valid("json").content,
        threadId: c.req.valid("param").id,
      })
    )
  )
  .openapi(retryChatMessageRoute, async (c) =>
    sse(
      c,
      await c.var.svc.chats.retry(
        requireActor(c.var.actor),
        c.req.valid("param").id,
        c.req.valid("param").messageId
      )
    )
  )
  .openapi(listChatsRoute, async (c) =>
    c.json(
      await c.var.svc.chats.list(
        requireActor(c.var.actor),
        c.req.valid("query")
      ),
      200
    )
  )
  .openapi(getChatRoute, async (c) =>
    c.json(
      await c.var.svc.chats.get(
        requireActor(c.var.actor),
        c.req.valid("param").id
      ),
      200
    )
  )
  .openapi(patchChatRoute, async (c) =>
    c.json(
      await c.var.svc.chats.pin(
        requireActor(c.var.actor),
        c.req.valid("param").id,
        c.req.valid("json").pinned
      ),
      200
    )
  )
  // Two statements but no branch, as for discarding a recording: hono's contextual typing will not
  // let an awaited `void` become the `null` body a 204 takes inside one expression.
  .openapi(deleteChatRoute, async (c) => {
    await c.var.svc.chats.remove(
      requireActor(c.var.actor),
      c.req.valid("param").id
    );
    return c.body(null, 204);
  })
  .openapi(putChatFeedbackRoute, async (c) =>
    c.json(
      await c.var.svc.chats.feedback(
        requireActor(c.var.actor),
        c.req.valid("param").id,
        c.req.valid("param").messageId,
        c.req.valid("json").feedback
      ),
      200
    )
  );
