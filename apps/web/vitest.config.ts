import { defineConfig } from "vitest/config";

// `node`, not `jsdom`: the rules this template cares about live in packages/server and are tested
// there. What is left here is markup and wiring. This config exists so `turbo test` has a task.
export default defineConfig({
  test: {
    environment: "node",
    // Without it, `vitest run` over zero test files exits 1 and fails the whole repository.
    passWithNoTests: true,
  },
});
