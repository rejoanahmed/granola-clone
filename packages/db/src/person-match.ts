import { type SQL, sql } from "drizzle-orm";

// The attendee match for a person key (`email:<addr>` or `name:<name>`, as `personKeyOf` in
// `@gc/domain/Domain/Person` mints them), over whatever columns the caller aliases as the effective
// email and name. A linked account's address and name win over the stored copy, as on the attendees
// sheet, so callers pass `coalesce(user, attendee)`. A `name:` key matches only an attendee with no
// address, because `personKeyOf` prefers the address whenever there is one.
//
// Here rather than in one repository because chats, notes and people all scope by a person, and
// repositories may not import each other: three copies would drift on who counts as the same
// person. The key is a plain string so this package need not depend on `@gc/domain`.
export const personMatches = (
  key: string,
  columns: { readonly email: SQL; readonly name: SQL }
): SQL => {
  const value = key.slice(key.indexOf(":") + 1);
  return key.startsWith("email:")
    ? sql`lower(trim(${columns.email})) = ${value}`
    : sql`coalesce(${columns.email}, '') = '' and lower(trim(${columns.name})) = ${value}`;
};
