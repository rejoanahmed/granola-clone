import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// The client plugin list must mirror the server's: `emailOTPClient()` is what adds
// `authClient.emailOtp.*` and `authClient.signIn.emailOtp`. No `inferAdditionalFields<Auth>()` —
// `createAuth` declares none, and importing `Auth` would pull `@gc/db` into the browser's types.
export const createWebAuthClient = (config: { baseURL: string }) =>
  createAuthClient({
    baseURL: config.baseURL,
    plugins: [emailOTPClient()],
  });

export type WebAuthClient = ReturnType<typeof createWebAuthClient>;
