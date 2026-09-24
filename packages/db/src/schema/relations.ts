import { relations } from "drizzle-orm";
import { user } from "./auth";
import { events, ticketTypes } from "./events";
import { payments } from "./payments";
import { registrationItems, registrations } from "./registrations";
import { tickets } from "./tickets";

// Only the two definitions whose imports would cycle live here. Drizzle does NOT merge two
// `relations(table, …)` calls for the same table — the last one loaded silently wins — so each
// table gets exactly one definition, and it is complete.
export const eventsRelations = relations(events, ({ one, many }) => ({
  organiser: one(user, {
    fields: [events.organiserId],
    references: [user.id],
  }),
  registrations: many(registrations),
  ticketTypes: many(ticketTypes),
}));

export const registrationsRelations = relations(
  registrations,
  ({ one, many }) => ({
    attendee: one(user, {
      fields: [registrations.attendeeId],
      references: [user.id],
    }),
    event: one(events, {
      fields: [registrations.eventId],
      references: [events.id],
    }),
    items: many(registrationItems),
    payments: many(payments),
    tickets: many(tickets),
  })
);
