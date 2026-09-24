import { Forbidden } from "@evb/domain/Errors";
import type { Actor } from "./Actor";

export { Forbidden } from "@evb/domain/Errors";

declare const AuthorizedTypeId: unique symbol;

// The brand cannot be forged from a plain subject, so a service method that passes an authorised
// subject onwards will not compile if it skipped the check.
export type Authorized<A> = A & { readonly [AuthorizedTypeId]: "Authorized" };

// An overload pair rather than a cast: the brand is type-level only, so there is nothing to attach
// and nothing to strip at runtime.
export function authorized<A>(subject: A): Authorized<A>;
export function authorized(subject: unknown): unknown {
  return subject;
}

// `Act` widens to `Actor | null` for the policies that answer for anonymous visitors.
export type Policy<A, Act = Actor> = {
  readonly action: string;
  holds: (subject: A, actor: Act) => boolean;
};

export const ensure = <A, Act = Actor>(
  policy: Policy<A, Act>,
  subject: A,
  actor: Act
): Authorized<A> => {
  if (!policy.holds(subject, actor)) {
    throw new Forbidden({ action: policy.action });
  }
  return authorized(subject);
};

// `holds` must stay pure and free of I/O — that is what makes a policy testable without a database.
export const make =
  <A, Act = Actor>(
    action: string,
    holds: (subject: A, actor: Act) => boolean
  ) =>
  (subject: A, actor: Act): Authorized<A> =>
    ensure({ action, holds }, subject, actor);
