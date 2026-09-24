import { defineConfig } from "vitest/config";

// `include` is the whole point: `tsc -b` emits `dist/` here (the package is `composite` because
// `@gc/server` references it), and the default include would collect `dist/**/*.test.js` too —
// the same assertions counted twice, with the built copy free to go stale. Same reason
// `packages/shared` and `packages/apiclient` say `bun test src` rather than `bun test`.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts"],
  },
});
