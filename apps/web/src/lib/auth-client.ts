import { createWebAuthClient } from "@gc/auth/client-web";

// Must match the origin better-auth is mounted on exactly — scheme, host and port — or the session
// cookie is set for one origin and read from another, and every request looks signed-out.
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

// Module scope: this client holds the session store, so a second one is a second store and half
// the app never learns that a sign-in happened.
export const authClient = createWebAuthClient({ baseURL: API_URL });
