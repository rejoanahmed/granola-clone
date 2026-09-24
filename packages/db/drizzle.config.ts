import { defineConfig } from "drizzle-kit";

// Use D1 HTTP only when all three are set; otherwise use DATABASE_URL (file or empty) for
// generate/studio. Nothing loads a .env here: the API's secrets live in `apps/api/.dev.vars`
// and these three are exported by the operator for the rare remote `drizzle-kit` run.
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.CLOUDFLARE_DATABASE_ID;
const token = process.env.CLOUDFLARE_D1_TOKEN;
const useD1Http = accountId && databaseId && token;

export default defineConfig({
  dialect: "sqlite",
  out: "./d1-migrations",
  schema: "./src/schema",
  ...(useD1Http && {
    dbCredentials: { accountId, databaseId, token },
    driver: "d1-http",
  }),
  ...(!useD1Http && {
    dbCredentials: { url: process.env.DATABASE_URL || "file:./local.sqlite" },
  }),
});
