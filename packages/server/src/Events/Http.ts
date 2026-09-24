import { Unauthorized } from "@gc/domain/Errors";
import {
  addTicketTypeRoute,
  cancelEventRoute,
  createEventRoute,
  getEventRoute,
  getMyEventRoute,
  listEventsRoute,
  listMyEventsRoute,
  publishEventRoute,
  updateEventRoute,
  updateTicketTypeRoute,
} from "@gc/domain/Event/Contract";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";

// Every `c.json()` names its status literal: without it Hono infers the union of every code the
// route declares, the body must then satisfy `ErrorBody` too, and the route stops compiling.

// Takes the context structurally rather than as `Context<AppEnv>` so it also accepts the narrower
// context `.openapi()` hands a typed handler.
const actorOf = (c: { var: { actor: Actor | null } }): Actor => {
  const actor = c.var.actor;
  // `== null`, not `=== null`: the type says `Actor | null`, but a Hono variable middleware never
  // set reads back `undefined`.
  if (actor == null) {
    throw new Unauthorized();
  }
  return actor;
};

export const eventsRouter = new OpenAPIHono<AppEnv>()
  .openapi(createEventRoute, async (c) =>
    c.json(await c.var.svc.events.create(actorOf(c), c.req.valid("json")), 201)
  )
  .openapi(listMyEventsRoute, async (c) =>
    c.json(
      await c.var.svc.events.listMine(actorOf(c), c.req.valid("query")),
      200
    )
  )
  .openapi(getMyEventRoute, async (c) =>
    c.json(
      await c.var.svc.events.detail(c.req.valid("param").eventId, actorOf(c)),
      200
    )
  )
  .openapi(updateEventRoute, async (c) =>
    c.json(
      await c.var.svc.events.update(
        c.req.valid("param").eventId,
        actorOf(c),
        c.req.valid("json")
      ),
      200
    )
  )
  .openapi(publishEventRoute, async (c) =>
    c.json(
      await c.var.svc.events.publish(c.req.valid("param").eventId, actorOf(c)),
      200
    )
  )
  .openapi(cancelEventRoute, async (c) =>
    c.json(
      await c.var.svc.events.cancel(c.req.valid("param").eventId, actorOf(c)),
      200
    )
  )
  .openapi(addTicketTypeRoute, async (c) =>
    c.json(
      await c.var.svc.events.addTicketType(
        c.req.valid("param").eventId,
        actorOf(c),
        c.req.valid("json")
      ),
      201
    )
  )
  .openapi(updateTicketTypeRoute, async (c) =>
    c.json(
      await c.var.svc.events.updateTicketType(
        c.req.valid("param").eventId,
        c.req.valid("param").ticketTypeId,
        actorOf(c),
        c.req.valid("json")
      ),
      200
    )
  )
  .openapi(listEventsRoute, async (c) =>
    c.json(await c.var.svc.events.listPublished(c.req.valid("query")), 200)
  )
  .openapi(getEventRoute, async (c) =>
    c.json(
      await c.var.svc.events.detail(
        c.req.valid("param").eventId,
        c.var.actor ?? null
      ),
      200
    )
  );
