import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const CLOUDFLARE_WORKERS = "cloudflare:workers";
const RESOLVED = `\0${CLOUDFLARE_WORKERS}`;

// `Runtime/traced.ts` imports `tracing` from `cloudflare:workers`, which only workerd provides.
// Duplicated from `packages/server` rather than shared: importing another package's vitest config
// is a build-order dependency for four lines of plugin. Nothing else is stubbed — `app.test.ts`
// builds the real container over an inert D1 handle, which is why it tests health, 404 and the
// error envelope rather than a use case.
const cloudflareWorkersStub = () => ({
  load: (id: string) =>
    id === RESOLVED
      ? [
          "const span = { end() {}, setAttribute() {} };",
          "export const tracing = { enterSpan: (_n, fn) => fn(span), startActiveSpan: (_n, fn) => fn(span) };",
        ].join("\n")
      : null,
  name: "cloudflare-workers-stub",
  resolveId: (id: string) => (id === CLOUDFLARE_WORKERS ? RESOLVED : null),
});

export default defineConfig({
  plugins: [cloudflareWorkersStub()],
  resolve: {
    alias: { "@api": path.resolve(dirname, "src") },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
});
