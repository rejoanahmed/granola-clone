import { defineConfig } from "vitest/config";

const CLOUDFLARE_WORKERS = "cloudflare:workers";
const RESOLVED = `\0${CLOUDFLARE_WORKERS}`;

// `Runtime/traced.ts` imports `tracing` from `cloudflare:workers`, which only workerd provides;
// the suite runs on node because services are plain objects of functions (R3). Stubbing costs
// nothing here: `traced.test.ts` asserts the wrapper's four paths — sync, resolved, rejected,
// throw — and whether `startActiveSpan` double-ends a span is a runtime question D011 answers.
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
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
});
