import { UserId } from "@gc/domain/Domain/Ids";
import { z } from "zod";

// Deliberately not better-auth's session type: a policy that took `Session` would drag the auth
// library into every `<Plural>/Policy.ts` and every test that wanted to check a rule.
export type Actor = {
  readonly email: string;
  readonly id: UserId;
  readonly name: string;
};

// A separate type rather than `Actor | null`, so it is not assignable to `Actor` and a sweeper's
// caller cannot reach a policy that compares ids.
export type SystemActor = { readonly id: "system"; readonly system: true };

const SessionEnvelope = z.object({
  user: z.object({
    email: z.string().min(1),
    id: UserId,
    name: z.string(),
  }),
});

// A malformed session resolves to `null` (anonymous) rather than throwing: a bad cookie must not
// 500 a public event page.
export const actorFromSession = (session: unknown): Actor | null => {
  const parsed = SessionEnvelope.safeParse(session);
  if (!parsed.success) {
    return null;
  }
  const { email, id, name } = parsed.data.user;
  return { email, id, name };
};
