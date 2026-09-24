import { type AuthConfig, createAuth } from "./index";

/**
 * The instance `bun run auth:generate-schema` points at. The better-auth CLI derives
 * `packages/db/src/schema/auth.ts` from a live instance's *options*, so a plugin added to
 * `createAuth` and not reflected here produces a schema missing that plugin's tables. `google` is
 * present so `account` is generated with the OAuth columns even where credentials are never set.
 *
 * `bunx auth@1.7.4 generate --config packages/auth/src/mock.ts --output packages/db/src/schema/auth.ts -y`
 */
export const auth = createAuth({
  baseURL: "http://localhost:3001",
  // The CLI reads options, not rows, and `drizzleAdapter` only optional-chains `db._?.schema` at
  // construction. Cast through `AuthConfig["db"]` rather than building a real client: this file is
  // not a permitted `@gc/db` importer, and `scripts/check-architecture.mjs` fails the build on one.
  db: {} as AuthConfig["db"],
  email: { sendOtpEmail: () => Promise.resolve() },
  google: { clientId: "generate-only", clientSecret: "generate-only" },
  nativeScheme: "gcnotes",
  secret: "generate-only-never-signs-anything",
  trustedOrigins: ["http://localhost:3003"],
});
