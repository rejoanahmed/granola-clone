import { z } from "zod";
import { UserId } from "./Ids";
import { Timestamp } from "./Time";

// The signed-in person as this API describes them — not better-auth's `user` row. The repository
// maps one onto the other, so a column better-auth adds never reaches the wire by accident.
export const Profile = z.object({
  createdAt: Timestamp,
  email: z.string().min(1),
  emailVerified: z.boolean(),
  id: UserId,
  name: z.string(),
});
export type Profile = z.infer<typeof Profile>;
