import { z } from "zod";
import { Timestamp } from "./Time";

// What a server says about itself before anyone signs in (D019): the app's first-run screen reads
// it to check that a URL really is one of these servers, and to choose between pairing (one owner)
// and the email code (several people). Nothing here is a secret; it names providers, never keys.
export const AuthMode = z.enum(["email-otp", "owner"]);
export type AuthMode = z.infer<typeof AuthMode>;

export const ServerInfo = z.object({
  auth: AuthMode,
  // Whether this server can send mail. When it cannot, the app sends feedback through the phone's
  // own mail app rather than offering a form that is bound to fail.
  email: z.boolean(),
  // The provider names, for the app's "About this server" row and an owner's own check.
  llm: z.string(),
  // Always this product's slug: a URL that answers anything else is not one of its servers.
  service: z.string(),
  transcription: z.string(),
  transcriptionLanguage: z.string(),
  // Bumped when the app needs a route an older server lacks.
  version: z.number().int().min(1),
});
export type ServerInfo = z.infer<typeof ServerInfo>;

// The server's contract version. 1 is the first self-hosted release.
export const SERVER_API_VERSION = 1;

export const OWNER_TOKEN_MAX = 256;

export const OwnerPairing = z.strictObject({
  token: z.string().min(1).max(OWNER_TOKEN_MAX),
});
export type OwnerPairing = z.infer<typeof OwnerPairing>;

// The session the pairing minted, as the cookie better-auth will verify: the app stores it in the
// same jar a code sign-in writes (`storeSessionCookie`), so nothing downstream knows how it came.
export const OwnerSession = z.object({
  cookie: z.object({ name: z.string(), value: z.string() }),
  expiresAt: Timestamp,
  // Ready to hand to the cookie jar, `Max-Age` included.
  setCookie: z.string(),
});
export type OwnerSession = z.infer<typeof OwnerSession>;
