import { Unauthorized } from "@evb/domain/Errors";
import {
  cancelRegistrationRoute,
  checkInRoute,
  getRegistrationRoute,
  listAttendeesRoute,
  listMyRegistrationsRoute,
  registerRoute,
} from "@evb/domain/Ticket/Contract";
import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../AppEnv";
import type { Actor } from "../Auth/Actor";

// Every `c.json()` names its status literal: without it Hono infers the union of every code the
// route declares, the body has to satisfy `ErrorBody` too, and the route stops compiling.

// `== null`, not `=== null`: a Hono variable middleware never set reads back `undefined`, and the
// strict form would hand that to a service — a 500 where the answer should be a 401.
const signedIn = (actor: Actor | null): Actor => {
  if (actor == null) {
    throw new Unauthorized({}, "Sign in to continue");
  }
  return actor;
};

export const ticketsRouter = new OpenAPIHono<AppEnv>()
  .openapi(registerRoute, async (c) =>
    c.json(
      await c.var.svc.tickets.register(
        signedIn(c.var.actor),
        c.req.valid("param").eventId,
        c.req.valid("json")
      ),
      201
    )
  )
  .openapi(listMyRegistrationsRoute, async (c) =>
    c.json(
      await c.var.svc.tickets.listMine(
        signedIn(c.var.actor),
        c.req.valid("query")
      ),
      200
    )
  )
  .openapi(getRegistrationRoute, async (c) =>
    c.json(
      await c.var.svc.tickets.detail(
        c.req.valid("param").registrationId,
        signedIn(c.var.actor)
      ),
      200
    )
  )
  .openapi(cancelRegistrationRoute, async (c) =>
    c.json(
      await c.var.svc.tickets.cancel(
        c.req.valid("param").registrationId,
        signedIn(c.var.actor)
      ),
      200
    )
  )
  .openapi(checkInRoute, async (c) =>
    c.json(
      await c.var.svc.tickets.checkIn(
        c.req.valid("json").code,
        signedIn(c.var.actor)
      ),
      200
    )
  )
  .openapi(listAttendeesRoute, async (c) =>
    c.json(
      await c.var.svc.tickets.attendees(
        c.req.valid("param").eventId,
        signedIn(c.var.actor),
        c.req.valid("query")
      ),
      200
    )
  );
